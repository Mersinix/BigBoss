import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Loader2, CheckCircle } from "lucide-react";
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

export function ReviewModal({ open, onClose, product, listings }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const listing = listings.find((l) => String(l.supplierId) === supplierId);
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          productId: product.id,
          listingId: listing?.id ?? null,
          rating,
          comment: comment.trim() || null,
          productName: product.name,
        }),
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
    onClose();
  };

  const canSubmit = rating > 0 && supplierId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[420px] rounded-3xl p-0 gap-0 overflow-hidden shadow-2xl">
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
          <div className="px-6 py-5 flex flex-col gap-5">
            {/* Supplier select */}
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

            {/* Star rating */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Rating *</label>
              <StarPicker value={rating} onChange={setRating} />
              {rating > 0 && (
                <p className="text-xs text-muted-foreground">
                  {["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating]}
                </p>
              )}
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Comment (optional)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience with this supplier…"
                className="rounded-xl border-gray-200 text-sm resize-none"
                rows={3}
              />
            </div>

            <Button
              onClick={() => mutation.mutate()}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
