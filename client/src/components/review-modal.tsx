import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Loader2, CheckCircle, Package, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

type ReviewType = "PRODUCT" | "SUPPLIER";

export function ReviewModal({ open, onClose, product, listings }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ReviewType>("PRODUCT");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

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
      toast({ title: "Review submitted", description: "Your review has been saved." });
      setTimeout(() => {
        handleClose();
      }, 1500);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
      <DialogContent className="sm:max-w-[440px] rounded-3xl p-0 gap-0 overflow-hidden shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="text-lg font-bold text-gray-900">Write a Review</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{product.name}</p>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500" />
            <p className="font-semibold text-gray-900">Review submitted!</p>
            <p className="text-sm text-muted-foreground">Thank you for your feedback.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {/* Tab switcher */}
            <div className="flex border-b border-gray-100">
              <button
                type="button"
                onClick={() => setActiveTab("PRODUCT")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === "PRODUCT"
                    ? "border-amber-500 text-amber-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Package className="w-3.5 h-3.5" /> Product Review
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("SUPPLIER")}
                disabled={listings.length === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === "SUPPLIER"
                    ? "border-amber-500 text-amber-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Store className="w-3.5 h-3.5" /> Supplier Review
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Supplier select — only on Supplier tab */}
              {activeTab === "SUPPLIER" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">Supplier *</label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="rounded-xl border-gray-200 text-sm">
                      <SelectValue placeholder="Select a supplier…" />
                    </SelectTrigger>
                    <SelectContent>
                      {listings.map((l) => (
                        <SelectItem key={l.supplierId} value={String(l.supplierId)}>
                          {l.supplierName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Context hint for product review */}
              {activeTab === "PRODUCT" && (
                <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                  Your review is about the product itself — quality, description accuracy, etc.
                </p>
              )}

              {/* Star rating */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Rating *</label>
                <StarPicker value={rating} onChange={setRating} />
                {rating > 0 && (
                  <p className="text-xs text-muted-foreground">{ratingLabel}</p>
                )}
              </div>

              {/* Comment */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Comment (optional)</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    activeTab === "PRODUCT"
                      ? "Share your experience with this product…"
                      : "Share your experience with this supplier…"
                  }
                  className="rounded-xl border-gray-200 text-sm resize-none"
                  rows={3}
                />
              </div>

              <Button
                onClick={() => mutation.mutate(activeTab)}
                disabled={!canSubmit || mutation.isPending}
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white py-5"
              >
                {mutation.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</span>
                ) : (
                  "Submit Review"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
