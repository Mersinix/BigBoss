import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Loader2, CheckCircle, Package, Store, AlertCircle, X, Sun, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
                : "text-gray-600/40"
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
          className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-600/25"}`}
        />
      ))}
    </div>
  );
}

type ReviewType = "PRODUCT" | "SUPPLIER";

export function ReviewModal({ open, onClose, product, listings }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ReviewType>("PRODUCT");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // ── Theme tokens ─────────────────────────────────────────────────────────────
  const dk = isDark;
  const bg          = dk ? "bg-gray-900"                        : "bg-white";
  const textPrimary = dk ? "text-white"                         : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                      : "text-gray-500";
  const cardBg      = dk ? "bg-gray-800 border-gray-700/60"     : "bg-gray-50 border-gray-100";
  const switcherBg  = dk ? "bg-gray-800"                        : "bg-gray-100";
  const switcherActive   = dk ? "bg-gray-700 text-white shadow-sm"    : "bg-white text-amber-600 shadow-sm";
  const switcherInactive = dk ? "text-gray-400 hover:text-gray-200"   : "text-gray-500 hover:text-gray-700";
  const divider     = dk ? "bg-gray-800"                        : "bg-gray-100";
  const iconBtn     = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";
  const inputCls    = dk
    ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl text-sm focus-visible:border-amber-500 focus-visible:ring-amber-500/20"
    : "border-gray-200 text-gray-900 rounded-xl text-sm focus-visible:border-amber-500 focus-visible:ring-amber-500/20";
  const labelCls    = dk ? "text-xs font-semibold text-gray-300" : "text-xs font-semibold text-gray-700";
  const reviewCardBg = dk ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100";
  const selectContent = dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : "";
  const selectItem    = dk ? "text-gray-200 focus:bg-gray-700 focus:text-white data-[highlighted]:bg-gray-700" : "";

  // Fetch existing product reviews for display + duplicate check
  const { data: existingReviews = [] } = useQuery<any[]>({
    queryKey: ["/api/reviews/product", product.id, "list"],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/product/${product.id}/list`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const alreadyReviewedProduct = user
    ? existingReviews.some((r) => r.cafeId === user.id)
    : false;

  const mutation = useMutation({
    mutationFn: async (type: ReviewType) => {
      const body: Record<string, unknown> = {
        productId: product.id,
        rating,
        comment: comment.trim() || null,
        productName: product.name,
        reviewType: type,
      };
      if (type === "SUPPLIER") {
        const listing = listings.find((l) => String(l.supplierId) === supplierId);
        body.supplierId = Number(supplierId);
        body.listingId = listing?.id ?? null;
      }
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
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/product", product.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/product", product.id, "list"] });
      toast({ title: "Review submitted", description: "Your review has been saved." });
      setTimeout(() => {
        handleClose();
      }, 1500);
    },
    onError: (err: Error) => {
      if (err.message.includes("already reviewed")) {
        toast({
          title: "Already reviewed",
          description: "You have already submitted a review for this product.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const handleClose = () => {
    setRating(0);
    setComment("");
    setSupplierId("");
    setSubmitted(false);
    setActiveTab("PRODUCT");
    onClose();
  };

  const canSubmit =
    rating > 0 && (activeTab === "PRODUCT" || (activeTab === "SUPPLIER" && !!supplierId));

  const ratingLabel = ["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating] ?? "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Write a Review</DialogTitle></VisuallyHidden>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${bg}`}>

          {/* ── Fixed header ── */}
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              {/* Close */}
              <button
                onClick={handleClose}
                aria-label="Close"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Centered title */}
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>Write a Review</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>{product.name}</span>
              </div>

              {/* Dark / light toggle */}
              <button
                onClick={() => setIsDark((d) => !d)}
                aria-label="Toggle theme"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
              </button>
            </div>

            {/* Tab switcher — pill style matching Favorites */}
            <div className={`flex gap-1 rounded-2xl p-1 ${switcherBg}`}>
              <button
                type="button"
                onClick={() => setActiveTab("PRODUCT")}
                className={`flex-1 py-2 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === "PRODUCT" ? switcherActive : switcherInactive}`}
              >
                <Package className="w-3.5 h-3.5" /> Product Review
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("SUPPLIER")}
                disabled={listings.length === 0}
                className={`flex-1 py-2 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${activeTab === "SUPPLIER" ? switcherActive : switcherInactive}`}
              >
                <Store className="w-3.5 h-3.5" /> Supplier Review
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
          >
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${dk ? "bg-emerald-500/15" : "bg-emerald-50"}`}>
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className={`font-semibold ${textPrimary}`}>Review submitted!</p>
                <p className={`text-sm ${textMuted}`}>Thank you for your feedback.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 py-1">
                {/* Already reviewed notice — product tab only */}
                {activeTab === "PRODUCT" && alreadyReviewedProduct && (
                  <div className={`flex items-center gap-2 border rounded-2xl px-4 py-3 text-sm ${dk ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="text-[13px]">You have already reviewed this product. Your review appears below.</span>
                  </div>
                )}

                {/* Context hint for product review */}
                {activeTab === "PRODUCT" && !alreadyReviewedProduct && (
                  <p className={`text-xs rounded-2xl px-4 py-3 border ${dk ? "text-gray-400 bg-gray-800/60 border-gray-700/40" : "text-gray-500 bg-gray-50 border-gray-100"}`}>
                    Your review is about the product itself — quality, description accuracy, etc.
                  </p>
                )}

                {/* Supplier select — only on Supplier tab */}
                {activeTab === "SUPPLIER" && (
                  <div className="space-y-1.5">
                    <label className={labelCls}>Supplier *</label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger className={`rounded-2xl ${dk ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200"} text-sm`}>
                        <SelectValue placeholder="Select a supplier…" />
                      </SelectTrigger>
                      <SelectContent className={selectContent}>
                        {listings.map((l) => (
                          <SelectItem key={l.supplierId} value={String(l.supplierId)} className={selectItem}>
                            {l.supplierName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Star rating — hide if already reviewed product */}
                {!(activeTab === "PRODUCT" && alreadyReviewedProduct) && (
                  <>
                    <div className="space-y-2">
                      <label className={labelCls}>Rating *</label>
                      <StarPicker value={rating} onChange={setRating} />
                      {rating > 0 && (
                        <p className={`text-xs ${textMuted}`}>{ratingLabel}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className={labelCls}>Comment (optional)</label>
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={
                          activeTab === "PRODUCT"
                            ? "Share your experience with this product…"
                            : "Share your experience with this supplier…"
                        }
                        className={`${inputCls} resize-none`}
                        rows={3}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => mutation.mutate(activeTab)}
                      disabled={!canSubmit || mutation.isPending}
                      className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 text-sm font-semibold transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
                    >
                      {mutation.isPending ? (
                        <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</span>
                      ) : (
                        "Submit Review"
                      )}
                    </button>
                  </>
                )}

                {/* Existing product reviews — shown on Product tab */}
                {activeTab === "PRODUCT" && existingReviews.length > 0 && (
                  <div className="mt-2">
                    <div className={`h-px w-full ${divider} mb-4`} />
                    <p className={`text-xs font-semibold mb-3 ${textMuted}`}>
                      {existingReviews.length} Product Review{existingReviews.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-col gap-3">
                      {existingReviews.map((r: any) => (
                        <div key={r.id} className={`border rounded-2xl p-4 space-y-2 ${reviewCardBg}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold ${textPrimary}`}>
                                {r.cafeName || r.cafeOwnerName || "Coffee Owner"}
                                {user && r.cafeId === user.id && (
                                  <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${dk ? "bg-amber-500/20 text-amber-400" : "bg-amber-50 text-amber-600"}`}>You</span>
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
