import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Layers, Minus, Plus, Package, Heart, Star, Calendar, AlertCircle, X, Sun, Moon, Lock,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { PackDetail, SupplierProductReview, PackVariantOption, ProductWithTaxonomy } from "@shared/schema";

// ── Theme tokens (mirrors browse-products + store-detail-page) ────────────────

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg:        dk ? "bg-gray-900"                        : "bg-white",
    cardBg:         dk ? "bg-gray-800 border-gray-700/60"     : "bg-white border-gray-100",
    innerCard:      dk ? "bg-gray-800/60 border-gray-700/40"  : "bg-gray-50 border-gray-100",
    textPrimary:    dk ? "text-white"                         : "text-gray-900",
    textMuted:      dk ? "text-gray-400"                      : "text-gray-500",
    textSubtle:     dk ? "text-gray-500"                      : "text-gray-400",
    divider:        dk ? "border-gray-800"                    : "border-gray-100",
    dividerBg:      dk ? "bg-gray-800"                        : "bg-gray-100",
    switcherBg:     dk ? "bg-gray-800"                        : "bg-gray-100",
    switcherActive: dk ? "bg-gray-700 text-amber-400 shadow-sm" : "bg-white text-amber-600 shadow-sm",
    switcherInact:  dk ? "text-gray-400 hover:text-gray-200"  : "text-gray-500 hover:text-gray-700",
    headerBg:       dk ? "bg-gray-900/95 border-gray-800"     : "bg-white/95 border-gray-100",
    stickyBg:       dk ? "bg-gray-900 border-gray-800"        : "bg-white border-gray-100",
    iconBtn:        dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500",
    imgBg:          dk ? "bg-gray-800"                        : "bg-gray-50",
    stepperBorder:  dk ? "border-gray-700"                    : "border-gray-200",
    stepperBtn:     dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-500",
    reviewForm:     dk ? "bg-gray-800 border-gray-700"        : "bg-gray-50 border-gray-200",
    reviewCard:     dk ? "bg-gray-800/60 border-gray-700/60"  : "bg-white border-gray-100",
    myReview:       dk ? "bg-amber-900/30 border-amber-800/50" : "bg-amber-50 border-amber-200",
    myReviewText:   dk ? "text-amber-400"                     : "text-amber-700",
    summaryCard:    dk ? "bg-amber-900/30 border-amber-800/50" : "bg-amber-50 border-amber-100",
    emptyIcon:      dk ? "text-gray-700"                      : "text-gray-300",
    badgePack:      dk ? "bg-amber-900/50 text-amber-400 border-amber-800/60" : "bg-amber-100 text-amber-700 border-amber-200",
    badgeBrand:     dk ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-600 border-gray-200",
    badgeCat:       dk ? "bg-gray-700/60 text-gray-400 border-gray-700" : "bg-gray-50 text-gray-500 border-gray-200",
    flavorRow:      dk ? "bg-gray-900/50 border-gray-700/40"  : "bg-white border-gray-100",
    inputCls:       dk ? "bg-gray-700 border-gray-600 text-gray-200 placeholder:text-gray-500" : "",
    cartFooter:     dk ? "bg-gray-900 border-gray-800"        : "bg-white border-gray-100",
  };
}

// ── Star rating input ─────────────────────────────────────────────────────────

function StarRatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              n <= (hovered || value) ? "fill-amber-400 text-amber-400" : "text-gray-400"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewStars({ rating, isDark = false }: { rating: number; isDark?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= rating ? "fill-amber-400 text-amber-400" : isDark ? "text-gray-600" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

// ── Pack Reviews Tab ──────────────────────────────────────────────────────────

function PackReviewsTab({ packId, isDark }: { packId: number; isDark: boolean }) {
  const t = useTheme(isDark);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const canReview = user?.role === "CAFE_OWNER" && (user as any).status === "approved";

  const { data: reviews = [], isLoading } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/pack", packId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/pack/${packId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!packId,
  });

  const myReview = user ? reviews.find(r => r.cafeId === user.id) : undefined;

  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment ?? "");
    }
  }, [myReview?.id]);

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", `/api/reviews/pack/${packId}`, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reviews/pack", packId] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/packs"] });
      toast({ title: "Review submitted!" });
      setRating(0);
      setComment("");
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error submitting review", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="py-4 space-y-2">
        <div className={`h-16 w-full rounded-2xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
        <div className={`h-16 w-full rounded-2xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canReview && !myReview && (
        <div className={`border rounded-2xl p-4 space-y-3 ${t.reviewForm}`}>
          <p className={`text-sm font-semibold ${t.textPrimary}`}>Leave a review</p>
          <StarRatingInput value={rating} onChange={setRating} />
          <Textarea
            placeholder="Share your experience with this pack…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className={`resize-none text-sm rounded-xl ${t.inputCls}`}
            rows={3}
          />
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={rating === 0 || submit.isPending}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-0"
          >
            {submit.isPending ? "Submitting…" : "Submit Review"}
          </Button>
        </div>
      )}

      {canReview && myReview && (
        <div className={`border rounded-2xl p-4 space-y-1.5 ${t.myReview}`}>
          <p className={`text-xs font-semibold ${t.myReviewText}`}>Your review</p>
          <div className="flex items-center justify-between">
            <ReviewStars rating={myReview.rating} isDark={isDark} />
          </div>
          {myReview.comment && <p className={`text-xs ${t.textMuted}`}>{myReview.comment}</p>}
          <p className={`text-[10px] ${t.textSubtle}`}>{myReview.createdAt ? new Date(myReview.createdAt).toLocaleDateString() : ""}</p>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="py-8 text-center">
          <Star className={`w-8 h-8 mx-auto mb-2 ${t.emptyIcon}`} />
          <p className={`text-sm ${t.textMuted}`}>No pack reviews yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r.id} className={`border rounded-2xl p-3 space-y-1.5 ${t.reviewCard}`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${t.textPrimary}`}>{r.cafeName || r.cafeOwnerName}</p>
                <ReviewStars rating={r.rating} isDark={isDark} />
              </div>
              {r.comment && <p className={`text-xs ${t.textMuted}`}>{r.comment}</p>}
              <p className={`text-[10px] ${t.textSubtle}`}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Supplier name + rating ────────────────────────────────────────────────────

function SupplierNameWithRating({ supplierId, supplierName, isDark }: { supplierId: number; supplierName: string; isDark: boolean }) {
  const t = useTheme(isDark);
  const { data: reviews = [] } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/supplier-public", supplierId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/supplier-public/${supplierId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!supplierId,
  });
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <p className={`text-sm font-semibold ${t.textMuted}`}>{supplierName}</p>
      {reviews.length > 0 && (
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className={`text-xs font-medium ${t.textPrimary}`}>{avgRating.toFixed(1)}</span>
          <span className={`text-[10px] ${t.textMuted}`}>({reviews.length})</span>
        </div>
      )}
    </div>
  );
}

// ── Supplier Reviews Tab ──────────────────────────────────────────────────────

function SupplierReviewsTab({ supplierId, supplierName, isDark }: { supplierId: number; supplierName: string; isDark: boolean }) {
  const t = useTheme(isDark);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const canReview = user?.role === "CAFE_OWNER" && (user as any).status === "approved";

  const { data: reviews = [], isLoading } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/supplier-public", supplierId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/supplier-public/${supplierId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!supplierId,
  });

  const myReview = user ? reviews.find(r => r.cafeId === user.id) : undefined;
  const alreadyReviewed = !!myReview;

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reviews", { reviewType: "SUPPLIER", supplierId, rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reviews/supplier-public", supplierId] });
      toast({ title: "Review submitted!" });
      setRating(0);
      setComment("");
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error submitting review", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="py-4 space-y-2">
        <div className={`h-16 w-full rounded-2xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
        <div className={`h-16 w-full rounded-2xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
      </div>
    );
  }

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-3">
      {reviews.length > 0 && (
        <div className={`border rounded-2xl p-4 flex items-center gap-4 ${t.summaryCard}`}>
          <div className="text-center shrink-0">
            <p className={`text-2xl font-extrabold ${t.dk ? "text-amber-400" : "text-amber-600"}`}>{avgRating.toFixed(1)}</p>
            <ReviewStars rating={Math.round(avgRating)} isDark={isDark} />
          </div>
          <div>
            <p className={`font-semibold text-sm ${t.textPrimary}`}>{supplierName}</p>
            <p className={`text-xs ${t.textMuted}`}>{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {canReview && !alreadyReviewed && (
        <div className={`border rounded-2xl p-4 space-y-3 ${t.reviewForm}`}>
          <p className={`text-sm font-semibold ${t.textPrimary}`}>Review {supplierName}</p>
          <StarRatingInput value={rating} onChange={setRating} />
          <Textarea
            placeholder="Share your experience with this supplier…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className={`resize-none text-sm rounded-xl ${t.inputCls}`}
            rows={3}
          />
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={rating === 0 || submit.isPending}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-0"
          >
            {submit.isPending ? "Submitting…" : "Submit Review"}
          </Button>
        </div>
      )}

      {canReview && alreadyReviewed && myReview && (
        <div className={`border rounded-2xl p-4 space-y-1.5 ${t.myReview}`}>
          <p className={`text-xs font-semibold ${t.myReviewText}`}>Your review of {supplierName}</p>
          <ReviewStars rating={myReview.rating} isDark={isDark} />
          {myReview.comment && <p className={`text-xs ${t.textMuted}`}>{myReview.comment}</p>}
          <p className={`text-[10px] ${t.textSubtle}`}>{myReview.createdAt ? new Date(myReview.createdAt).toLocaleDateString() : ""}</p>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="py-8 text-center">
          <Star className={`w-8 h-8 mx-auto mb-2 ${t.emptyIcon}`} />
          <p className={`text-sm ${t.textMuted}`}>No supplier reviews yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.slice(0, 10).map(r => (
            <div key={r.id} className={`border rounded-2xl p-3 space-y-1.5 ${t.reviewCard}`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${t.textPrimary}`}>{r.cafeName || r.cafeOwnerName}</p>
                <ReviewStars rating={r.rating} isDark={isDark} />
              </div>
              {r.comment && <p className={`text-xs ${t.textMuted}`}>{r.comment}</p>}
              <p className={`text-[10px] ${t.textSubtle}`}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Flavor Distribution Row ───────────────────────────────────────────────────

type FlavorAllocation = { variantId: number; flavorName: string | null; sizeName: string | null; quantity: number; availableQty: number };

function FlavorDistributionRow({ item, allocations, onChange, isDark }: {
  item: { productName: string; quantity: number; listingVariants: PackVariantOption[] };
  allocations: FlavorAllocation[];
  onChange: (allocs: FlavorAllocation[]) => void;
  isDark: boolean;
}) {
  const t = useTheme(isDark);
  const totalAllocated = allocations.reduce((s, a) => s + a.quantity, 0);
  const remaining = item.quantity - totalAllocated;
  const isValid = remaining === 0;

  const setQty = (variantId: number, qty: number) => {
    onChange(allocations.map(a => a.variantId === variantId ? { ...a, quantity: Math.max(0, Math.min(qty, a.availableQty)) } : a));
  };

  return (
    <div className={`border rounded-2xl p-4 space-y-3 ${t.dk ? "bg-gray-800/50 border-gray-700/60" : "bg-amber-50/40 border-amber-100"}`}>
      {/* Header: product name + allocation badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className={`text-sm font-bold ${t.textPrimary}`}>{item.productName}</p>
        <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          isValid
            ? (t.dk ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700")
            : (t.dk ? "bg-amber-900/50 text-amber-400" : "bg-amber-100 text-amber-700")
        }`}>
          {totalAllocated}/{item.quantity}
          {!isValid && remaining > 0 && <span className="ml-1 font-normal">({remaining} left)</span>}
          {!isValid && remaining < 0 && <span className="ml-1 font-normal">(over by {Math.abs(remaining)})</span>}
        </div>
      </div>

      {/* Flavor rows */}
      <div className="space-y-2">
        {allocations.map(a => (
          <div key={a.variantId} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${t.flavorRow}`}>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${t.textPrimary}`}>
                {[a.flavorName, a.sizeName].filter(Boolean).join(" · ") || "Default"}
              </p>
              <p className={`text-[10px] ${t.textSubtle}`}>{a.availableQty} in stock</p>
            </div>
            {/* Qty stepper */}
            <div className={`flex items-center border rounded-xl overflow-hidden ${t.stepperBorder}`}>
              <button
                className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                onClick={() => setQty(a.variantId, a.quantity - 1)}
                disabled={a.quantity <= 0}
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className={`px-3 text-xs font-bold w-8 text-center ${t.textPrimary}`}>{a.quantity}</span>
              <button
                className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                onClick={() => setQty(a.variantId, a.quantity + 1)}
                disabled={a.quantity >= a.availableQty || totalAllocated >= item.quantity}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isValid && (
        <div className={`flex items-center gap-1.5 text-xs ${t.dk ? "text-amber-400" : "text-amber-600"}`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Quantities must add up to {item.quantity}</span>
        </div>
      )}
    </div>
  );
}

// ── Product Preview Modal (read-only, opened from inside a Pack) ─────────────

function ProductPreviewModal({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const [isDark, setIsDark] = useState(true);

  const { data: product, isLoading } = useQuery<ProductWithTaxonomy>({
    queryKey: ["/api/marketplace", productId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/${productId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: productId != null,
  });

  const dk = isDark;
  const bg          = dk ? "bg-gray-900"                    : "bg-white";
  const textPrimary = dk ? "text-white"                     : "text-gray-900";
  const textMuted   = dk ? "text-gray-400"                  : "text-gray-500";
  const imgBg       = dk ? "bg-gray-800"                    : "bg-gray-50";
  const divider     = dk ? "bg-gray-800"                    : "bg-gray-100";
  const iconBtn     = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";

  return (
    <Dialog open={productId != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-md w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden"
        data-testid="modal-pack-product-preview"
      >
        <VisuallyHidden><DialogTitle>Product Preview</DialogTitle></VisuallyHidden>

        <div className={`flex flex-col max-h-[85vh] overflow-hidden transition-colors duration-200 ${bg}`}>

          {/* ── Fixed header ── */}
          <div className={`shrink-0 ${bg} px-5 pt-5 pb-4`}>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={onClose}
                aria-label="Close"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>

              <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>Product Preview</span>

              <button
                onClick={() => setIsDark((d) => !d)}
                aria-label="Toggle theme"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
              </button>
            </div>
            <div className={`h-px w-full ${divider}`} />
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
            {isLoading || !product ? (
              <div className="space-y-4 py-2">
                <Skeleton className={`h-44 w-full rounded-2xl ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
                <Skeleton className={`h-5 w-2/3 ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
                <Skeleton className={`h-4 w-1/2 ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Product image */}
                <div className={`aspect-video rounded-2xl overflow-hidden flex items-center justify-center ${imgBg}`}>
                  {product.imageUrl
                    ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    : <Package className={`w-12 h-12 ${dk ? "text-gray-600" : "text-gray-200"}`} />
                  }
                </div>

                {/* Name + badges */}
                <div>
                  <h3 className={`font-bold text-[17px] leading-snug ${textPrimary}`} data-testid="text-preview-product-name">
                    {product.name}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {product.categoryLabel && (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-xl border ${dk ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-gray-100 border-gray-200 text-gray-600"}`}>
                        {product.categoryLabel.name}
                      </span>
                    )}
                    {product.subCategoryLabel && (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-xl border ${dk ? "bg-gray-800 border-gray-700/60 text-gray-400" : "bg-white border-gray-200 text-gray-500"}`}>
                        {product.subCategoryLabel.name}
                      </span>
                    )}
                    {product.brandLabel && (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-xl border ${dk ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                        {product.brandLabel.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                {product.description && (
                  <p className={`text-sm leading-relaxed ${textMuted}`}>{product.description}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function PackQuickViewModal() {
  const packId = usePackQuickView((s) => s.packId);
  const close  = usePackQuickView((s) => s.close);

  const [qty, setQty]           = useState(1);
  const [activeTab, setActiveTab] = useState<"details" | "reviews">("details");
  const [reviewsTab, setReviewsTab] = useState<"pack" | "supplier">("pack");
  const [previewProductId, setPreviewProductId] = useState<number | null>(null);

  // ── Dark / light mode (dark by default) ───────────────────────────────────
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);

  // ── Scroll detection for fixed header ─────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const addPackItem = useCart((s) => s.addPackItem);
  const faved      = useFavorites((s) => (packId != null ? !!s.pack[packId] : false));
  const togglePack = useFavorites((s) => s.togglePack);

  const { data: pack, isLoading } = useQuery<PackDetail>({
    queryKey: ["/api/marketplace/packs", packId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/packs/${packId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: packId != null,
  });

  // ── Flavor distribution state ─────────────────────────────────────────────
  const [flavorSelections, setFlavorSelections] = useState<Record<number, FlavorAllocation[]>>({});

  function buildDefaultAllocations(p: typeof pack, packQty: number): Record<number, FlavorAllocation[]> {
    if (!p) return {};
    const result: Record<number, FlavorAllocation[]> = {};
    for (const item of p.items) {
      const inStockVariants = item.listingVariants.filter(v => v.availableQuantity > 0);
      if (inStockVariants.length > 1) {
        const target = item.quantity * packQty;
        const selectedVariant = item.variantId
          ? inStockVariants.find(v => v.variantId === item.variantId)
          : null;

        if (selectedVariant) {
          const onSelected = Math.min(target, selectedVariant.availableQuantity);
          let leftover = target - onSelected;
          const allocs: FlavorAllocation[] = inStockVariants.map(v => {
            if (v.variantId === selectedVariant.variantId) {
              return { variantId: v.variantId, flavorName: v.flavorName, sizeName: v.sizeName, quantity: onSelected, availableQty: v.availableQuantity };
            }
            const give = Math.min(leftover, v.availableQuantity);
            leftover -= give;
            return { variantId: v.variantId, flavorName: v.flavorName, sizeName: v.sizeName, quantity: give, availableQty: v.availableQuantity };
          });
          result[item.id] = allocs;
        } else {
          let leftover = target;
          const allocs: FlavorAllocation[] = inStockVariants.map(v => {
            const give = Math.min(leftover, v.availableQuantity);
            leftover -= give;
            return { variantId: v.variantId, flavorName: v.flavorName, sizeName: v.sizeName, quantity: give, availableQty: v.availableQuantity };
          });
          result[item.id] = allocs;
        }
      }
    }
    return result;
  }

  useEffect(() => {
    if (!pack) return;
    setFlavorSelections(buildDefaultAllocations(pack, qty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack?.id, qty]);

  useEffect(() => {
    setQty(1);
    setActiveTab("details");
    setReviewsTab("pack");
    setScrolled(false);
  }, [packId]);

  const individualTotal = pack ? pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) : 0;
  const maxQty = pack ? Math.min(pack.quantityAvailable, pack.maxBuildable) : 0;

  const flavorSelectionsValid = useMemo(() => {
    if (!pack) return true;
    return pack.items.every(item => {
      const allocs = flavorSelections[item.id];
      if (!allocs) return true;
      const target = item.quantity * qty;
      const totalOk = allocs.reduce((s, a) => s + a.quantity, 0) === target;
      const perVariantOk = allocs.every(a => a.quantity <= a.availableQty);
      return totalOk && perVariantOk;
    });
  }, [pack, flavorSelections, qty]);

  const handleAddToCart = () => {
    if (!pack) return;
    const includedProducts = pack.items.flatMap(item => {
      const allocs = flavorSelections[item.id];
      if (!allocs) {
        return [{
          productName: item.productName,
          flavorName: item.flavorName,
          sizeName: item.sizeName,
          quantity: item.quantity,
        }];
      }
      return allocs
        .filter(a => a.quantity > 0)
        .map(a => ({
          productName: item.productName,
          flavorName: a.flavorName,
          sizeName: a.sizeName,
          quantity: a.quantity,
        }));
    });

    addPackItem({
      packId: pack.id,
      packName: pack.name,
      packImageUrl: pack.imageUrl ?? null,
      supplierId: pack.supplierId,
      supplierName: pack.supplierName,
      unitPrice: pack.price,
      includedProducts,
    }, qty);
    toast({ title: "Ajouté au panier", description: `${pack.name} × ${qty}` });
    close();
  };

  const hasFlavorChoice = pack ? pack.items.some(i => i.listingVariants.filter(v => v.availableQuantity > 0).length > 1) : false;

  return (
    <Dialog open={packId != null} onOpenChange={(open) => { if (!open) close(); }}>
      {/*
        DialogContent: flex column, no inner scroll (scroll is on the inner div),
        p-0 to let our header/body/footer control all spacing,
        hide the default shadcn close button (we use our own in the header).
      */}
      <DialogContent
        className={`max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0 border-0 shadow-2xl rounded-3xl [&>button:last-child]:hidden ${t.modalBg}`}
        data-testid="modal-pack-quick-view"
      >
        <VisuallyHidden>
          <DialogTitle>Pack Details</DialogTitle>
        </VisuallyHidden>

        {/* ── Fixed header ───────────────────────────────────────────────── */}
        <div className={`shrink-0 px-5 pt-4 pb-3 border-b backdrop-blur-sm transition-colors ${t.headerBg}`}>
          <div className="flex items-center gap-3">
            {/* Fav button */}
            <button
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110 ${t.iconBtn}`}
              onClick={() => pack && togglePack(pack.id)}
              data-testid="button-fav-pack-modal"
            >
              <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : ""}`} />
            </button>

            {/* Pack name + tags — fade in on scroll */}
            <div className={`flex-1 min-w-0 transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <p className={`text-[13px] font-bold truncate text-center ${t.textPrimary}`}>
                {pack?.name ?? ""}
              </p>
              {pack && (pack.brandLabels.length > 0 || pack.categoryLabels.length > 0) && (
                <div className="flex items-center justify-center gap-1 flex-wrap mt-0.5">
                  <span className={`text-[10px] font-semibold ${t.dk ? "text-amber-400" : "text-amber-600"}`}>Pack</span>
                  {pack.brandLabels.slice(0, 2).map(b => (
                    <span key={b.id} className={`text-[10px] ${t.textMuted}`}>· {b.name}</span>
                  ))}
                  {pack.categoryLabels.slice(0, 2).map(c => (
                    <span key={c.id} className={`text-[10px] ${t.textMuted}`}>· {c.name}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Sun/Moon toggle */}
            <button
              onClick={() => setIsDark(d => !d)}
              aria-label="Toggle theme"
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${t.iconBtn}`}
            >
              {isDark
                ? <Sun className="w-4 h-4 text-amber-400" />
                : <Moon className="w-4 h-4 text-gray-500" />
              }
            </button>

            {/* Close button */}
            <button
              onClick={close}
              aria-label="Close"
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${t.iconBtn}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full"
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 90)}
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {isLoading || !pack ? (
            <div className="px-5 py-6 space-y-4">
              <div className={`h-48 w-full rounded-2xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
              <div className={`h-6 w-2/3 rounded-xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
              <div className={`h-4 w-1/2 rounded-xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
            </div>
          ) : (
            <>
              {/* ── Hero image ─────────────────────────────────────────── */}
              <div className={`relative aspect-[16/9] ${t.imgBg} overflow-hidden`}>
                {pack.imageUrl ? (
                  <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Layers className={`w-16 h-16 ${t.emptyIcon}`} />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* ── Pack info section ──────────────────────────────────── */}
              <div className="px-5 pt-5 pb-4 space-y-3">
                {/* Badges row */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className={`text-[10px] font-semibold border px-2 py-0.5 ${t.badgePack}`}>
                    <Layers className="w-3 h-3 mr-1 inline" />Pack
                  </Badge>
                  {pack.brandLabels.map(b => (
                    <Badge key={b.id} className={`text-[10px] border px-2 py-0.5 ${t.badgeBrand}`}>{b.name}</Badge>
                  ))}
                  {pack.categoryLabels.map(c => (
                    <Badge key={c.id} className={`text-[10px] border px-2 py-0.5 ${t.badgeCat}`}>{c.name}</Badge>
                  ))}
                </div>

                {/* Pack name */}
                <h2 className={`text-xl font-extrabold leading-tight ${t.textPrimary}`} data-testid="text-pack-name">
                  {pack.name}
                </h2>

                {/* Description */}
                {pack.description && (
                  <p className={`text-sm leading-relaxed ${t.textMuted}`}>{pack.description}</p>
                )}

                {/* Supplier */}
                <SupplierNameWithRating supplierId={pack.supplierId} supplierName={pack.supplierName} isDark={isDark} />

                {/* Price / stock / expiry / rating row */}
                <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t ${t.divider}`}>
                  {/* Price */}
                  <div className="flex items-baseline gap-2.5">
                    <span
                      className={`text-2xl font-extrabold ${t.dk ? "text-amber-400" : "text-amber-600"}`}
                      data-testid="text-pack-price"
                    >
                      {formatCurrency(pack.price)}
                    </span>
                    {individualTotal > pack.price && (
                      <span className={`text-sm line-through ${t.textMuted}`}>{formatCurrency(individualTotal)}</span>
                    )}
                  </div>

                  {/* Stock */}
                  <span className={`text-sm font-medium ${t.textMuted}`}>
                    {maxQty} disponible{maxQty !== 1 ? "s" : ""}
                  </span>

                  {/* Expiry */}
                  {pack.expirationDate && (
                    <div className={`flex items-center gap-1 text-sm ${t.textMuted}`}>
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      Expires {new Date(pack.expirationDate).toLocaleDateString()}
                    </div>
                  )}

                  {/* Rating */}
                  {pack.packReviewCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className={`text-sm font-semibold ${t.textPrimary}`}>{pack.packAvgRating.toFixed(1)}</span>
                      <span className={`text-xs ${t.textMuted}`}>({pack.packReviewCount})</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Sticky tabs (Pack Details / Reviews) ──────────────── */}
              <div className={`sticky top-0 z-10 border-b px-5 py-2 transition-colors ${t.stickyBg}`}>
                {/* Favorites-style pill switcher */}
                <div className={`inline-flex rounded-2xl p-1 gap-1 ${t.switcherBg}`}>
                  <button
                    onClick={() => setActiveTab("details")}
                    className={`px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${activeTab === "details" ? t.switcherActive : t.switcherInact}`}
                  >
                    Pack Details
                  </button>
                  <button
                    onClick={() => setActiveTab("reviews")}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${activeTab === "reviews" ? t.switcherActive : t.switcherInact}`}
                  >
                    Reviews
                    {pack.packReviewCount > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.dk ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-600"}`}>
                        {pack.packReviewCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* ── Tab content ────────────────────────────────────────── */}
              <div className="px-5 pt-4 pb-4">

                {/* DETAILS TAB */}
                {activeTab === "details" && (
                  <div className="space-y-4">

                    {/* Included products */}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${t.textMuted}`}>
                        Included Products
                      </p>
                      <div className={`border rounded-2xl overflow-hidden divide-y ${t.dk ? "border-gray-700/60 divide-gray-700/60" : "border-gray-100 divide-gray-100"}`}>
                        {pack.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`flex items-center gap-3 p-3.5 w-full text-left transition-colors ${t.dk ? "hover:bg-gray-700/40" : "hover:bg-gray-50"}`}
                            onClick={() => setPreviewProductId(item.productId)}
                            data-testid={`button-pack-item-preview-${item.id}`}
                          >
                            {/* Thumbnail */}
                            <div className={`w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border ${t.dk ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-100"}`}>
                              {item.productImageUrl
                                ? <img src={item.productImageUrl} className="w-full h-full object-cover" alt="" />
                                : <Package className={`w-4 h-4 ${t.textSubtle}`} />
                              }
                            </div>
                            {/* Name + flavor */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${t.textPrimary}`}>{item.productName}</p>
                              {(item.flavorName || item.sizeName) && (
                                <p className={`text-xs mt-0.5 ${t.textMuted}`}>
                                  {[item.flavorName, item.sizeName].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            {/* Qty badge */}
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-xl shrink-0 ${t.dk ? "bg-gray-700 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                              ×{item.quantity}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Flavor distribution */}
                    {hasFlavorChoice && (
                      <div className="space-y-3">
                        <div>
                          <p className={`text-sm font-bold ${t.textPrimary}`}>Choose your flavor distribution</p>
                          <p className={`text-xs mt-0.5 ${t.textMuted}`}>Distribute the quantities across available flavors for each product.</p>
                        </div>
                        {pack.items
                          .filter(item => item.listingVariants.filter(v => v.availableQuantity > 0).length > 1)
                          .map(item => {
                            const allocs = flavorSelections[item.id];
                            if (!allocs) return null;
                            return (
                              <FlavorDistributionRow
                                key={item.id}
                                item={{ ...item, quantity: item.quantity * qty, listingVariants: item.listingVariants.filter(v => v.availableQuantity > 0) }}
                                allocations={allocs}
                                onChange={newAllocs => setFlavorSelections(prev => ({ ...prev, [item.id]: newAllocs }))}
                                isDark={isDark}
                              />
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                )}

                {/* REVIEWS TAB */}
                {activeTab === "reviews" && (
                  <div className="space-y-4">
                    {/* Inner Pack / Supplier sub-switcher */}
                    <div className={`inline-flex rounded-2xl p-1 gap-1 ${t.switcherBg}`}>
                      <button
                        onClick={() => setReviewsTab("pack")}
                        className={`px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${reviewsTab === "pack" ? t.switcherActive : t.switcherInact}`}
                      >
                        Pack Reviews
                      </button>
                      <button
                        onClick={() => setReviewsTab("supplier")}
                        className={`px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${reviewsTab === "supplier" ? t.switcherActive : t.switcherInact}`}
                      >
                        Supplier Reviews
                      </button>
                    </div>

                    {reviewsTab === "pack" && (
                      <PackReviewsTab packId={pack.id} isDark={isDark} />
                    )}
                    {reviewsTab === "supplier" && (
                      <SupplierReviewsTab supplierId={pack.supplierId} supplierName={pack.supplierName} isDark={isDark} />
                    )}
                  </div>
                )}
              </div>

              {/* Bottom spacer so content isn't hidden behind fixed footer */}
              <div className="h-4" />
            </>
          )}
        </div>

        {/* ── Fixed footer: qty stepper + Add to Cart ──────────────────────── */}
        {pack && !isLoading && (
          <div className={`shrink-0 border-t px-5 py-4 transition-colors ${t.cartFooter}`}>
            <div className="flex items-center gap-3">
              {/* Qty stepper */}
              <div className={`flex items-center border rounded-2xl overflow-hidden ${t.stepperBorder}`}>
                <button
                  className={`px-3 py-2.5 transition-colors ${t.stepperBtn}`}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  data-testid="button-decrease-pack-qty"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className={`px-4 text-sm font-bold w-10 text-center ${t.textPrimary}`}>{qty}</span>
                <button
                  className={`px-3 py-2.5 transition-colors ${t.stepperBtn}`}
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  data-testid="button-increase-pack-qty"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* CTA button */}
              <button
                className={`flex-1 py-3 px-4 rounded-2xl text-sm font-bold transition-all ${
                  maxQty === 0 || !flavorSelectionsValid
                    ? (t.dk ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                    : "bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white shadow-lg shadow-amber-500/20"
                }`}
                disabled={maxQty === 0 || !flavorSelectionsValid}
                onClick={handleAddToCart}
                data-testid="button-add-pack-to-cart"
              >
                {maxQty === 0
                  ? "Out of stock"
                  : !flavorSelectionsValid
                    ? "Complete flavor selection"
                    : `Ajouter au panier · ${formatCurrency(pack.price * qty)}`
                }
              </button>
            </div>
          </div>
        )}
      </DialogContent>

      <ProductPreviewModal productId={previewProductId} onClose={() => setPreviewProductId(null)} />
    </Dialog>
  );
}
