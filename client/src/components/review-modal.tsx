import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, CheckCircle, Package, X, Sun, Moon, Pencil } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import type { MarketplaceListing, MarketplaceProduct } from "@shared/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  product: MarketplaceProduct;
  listings: MarketplaceListing[]; // visible / filtered listings
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
          className="transition-transform hover:scale-110 focus:outline-none"
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              i <= (hovered || value)
                ? "fill-amber-400 text-amber-400"
                : "text-gray-600/40 dark:text-gray-400/40"
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

export function ReviewModal({ open, onClose, product, listings }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
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

  // Fetch existing product reviews for display
  const { data: existingReviews = [] } = useQuery<any[]>({
    queryKey: ["/api/reviews/product", product.id, "list"],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/product/${product.id}/list`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  // Fetch user's own product review (for pre-filling)
  const { data: myProductReview } = useQuery<any>({
    queryKey: ["/api/reviews/my/product", product.id],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/my/product/${product.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!user,
  });

  // Pre-populate form when an existing review is found
  useEffect(() => {
    if (myProductReview) {
      setRating(myProductReview.rating ?? 0);
      setComment(myProductReview.comment ?? "");
    } else {
      setRating(0);
      setComment("");
    }
  }, [myProductReview]);

  const isEditing = !!myProductReview;

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        productId: product.id,
        rating,
        comment: comment.trim() || null,
        productName: product.name,
        reviewType: "PRODUCT",
      };
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/product", String(product.id)] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/product", product.id, "list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/my/product", product.id] });
      invalidateMarketplace(queryClient, product.id);
      toast({ title: isEditing ? "Avis mis à jour" : "Avis publié", description: "Votre avis a été enregistré." });
      setTimeout(() => {
        handleClose();
      }, 1500);
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setRating(0);
    setComment("");
    setSubmitted(false);
    onClose();
  };

  const canSubmit = rating > 0;

  const ratingLabel = ["", "Médiocre", "Correct", "Bien", "Très bien", "Excellent"][rating] ?? "";

  // Swipe-to-dismiss on the grabber (task: "Standardize Coffee Owner Review
  // Modals and Grabber Dismissal Behavior") — same shared hook, same
  // parameters as the Product Detail Modal reference (liveDrag=true, 70px
  // threshold, 520ms exit). The grabber previously rendered here was purely
  // decorative; this wires it to the modal's own existing scroll container.
  // Close button / backdrop / Escape still call handleClose directly,
  // unchanged — unlike the Product Detail Modal, this modal's content isn't
  // conditionally unmounted by its own open flag, so there's no premature-
  // unmount flash to guard against on those paths.
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
                <span className={`text-[11px] font-medium ${textMuted}`}>{product.name}</span>
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
              <Package className="w-3.5 h-3.5" /> Avis sur le produit
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
            

                {/* Star rating */}
                <div className="space-y-1">
                  <label className={labelCls}>Note *</label>
                  <StarPicker value={rating} onChange={setRating} />
                  {rating > 0 && (
                    <p className={`text-xs ${textMuted}`}>{ratingLabel}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className={labelCls}>Commentaire (facultatif)</label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Partagez votre expérience avec ce produit…"
                    className={`${inputCls} resize-none`}
                    rows={3}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => mutation.mutate()}
                  disabled={!canSubmit || mutation.isPending}
                  className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 text-sm font-semibold transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
                >
                  {mutation.isPending ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</span>
                  ) : isEditing ? "Mettre à jour l'avis" : "Publier l'avis"}
                </button>

                {/* Existing product reviews */}
                {existingReviews.length > 0 && (
                  <div className="mt-2">
                    <div className={`h-px w-full ${divider} mb-4`} />              
                    <div className={`flex items-center justify-center gap-1.5 py-2 mb-3 text-[11px] font-semibold rounded-xl ${dk ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
                      <Star className="w-3.5 h-3.5" /> {existingReviews.length} avis sur ce produit
                    </div>
                    <div className="flex flex-col gap-3">
                      {existingReviews.map((r: any) => (
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
