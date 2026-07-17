import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Layers, Minus, Plus, Package, Heart, Star, Calendar, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { PackDetail, SupplierProductReview, PackVariantOption, ProductWithTaxonomy } from "@shared/schema";

// ── Star rating UI ────────────────────────────────────────────────────────────

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
              n <= (hovered || value) ? "fill-amber-400 text-amber-400" : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
    </div>
  );
}

// ── Pack Reviews Tab ──────────────────────────────────────────────────────────

function PackReviewsTab({ packId }: { packId: number }) {
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

  // Check if this user already submitted a review for this pack
  const myReview = user ? reviews.find(r => r.cafeId === user.id) : undefined;

  // Pre-fill form if editing existing review
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

  if (isLoading) return <div className="py-4 space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;

  return (
    <div className="space-y-4">
      {/* Submission form — only show if user hasn't reviewed yet */}
      {canReview && !myReview && (
        <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">Leave a review</p>
          <StarRatingInput value={rating} onChange={setRating} />
          <Textarea
            placeholder="Share your experience with this pack…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="resize-none text-sm"
            rows={3}
          />
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={rating === 0 || submit.isPending}
          >
            {submit.isPending ? "Submitting…" : "Submit Review"}
          </Button>
        </div>
      )}

      {/* Show user's own review with a note if they already reviewed */}
      {canReview && myReview && (
        <div className="border border-amber-200 rounded-xl p-4 space-y-1 bg-amber-50">
          <p className="text-xs font-medium text-amber-700">Your review</p>
          <div className="flex items-center justify-between">
            <ReviewStars rating={myReview.rating} />
          </div>
          {myReview.comment && <p className="text-xs text-gray-600">{myReview.comment}</p>}
          <p className="text-[10px] text-gray-400">{myReview.createdAt ? new Date(myReview.createdAt).toLocaleDateString() : ""}</p>
        </div>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <div className="py-6 text-center text-gray-400">
          <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No pack reviews yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="border rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800">{r.cafeName || r.cafeOwnerName}</p>
                <ReviewStars rating={r.rating} />
              </div>
              {r.comment && <p className="text-xs text-gray-500">{r.comment}</p>}
              <p className="text-[10px] text-gray-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Supplier name + rating (shown in Pack Details header) ────────────────────

function SupplierNameWithRating({ supplierId, supplierName }: { supplierId: number; supplierName: string }) {
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
    <div className="flex items-center gap-2 mt-2">
      <p className="font-bold text-sm text-gray-500">{supplierName}</p>
      {reviews.length > 0 && (
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="text-xs font-medium text-gray-600">{avgRating.toFixed(1)}</span>
          <span className="text-[10px] text-gray-400">({reviews.length})</span>
        </div>
      )}
    </div>
  );
}

// ── Supplier Reviews Tab ──────────────────────────────────────────────────────

function SupplierReviewsTab({ supplierId, supplierName }: { supplierId: number; supplierName: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const canReview = user?.role === "CAFE_OWNER" && (user as any).status === "approved";

  // Public endpoint — any visitor can read a supplier's reviews from inside a Pack.
  // (Distinct from /api/reviews/supplier/:id, which is restricted to the supplier's own dashboard.)
  const { data: reviews = [], isLoading } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/supplier-public", supplierId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/supplier-public/${supplierId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!supplierId,
  });

  // Check if this user already reviewed this supplier
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

  if (isLoading) return <div className="py-4 space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-4">
      {reviews.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{avgRating.toFixed(1)}</p>
            <ReviewStars rating={Math.round(avgRating)} />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-700">{supplierName}</p>
            <p className="text-xs text-gray-500">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {/* Submission form — only show if user hasn't reviewed this supplier yet */}
      {canReview && !alreadyReviewed && (
        <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-700">Review {supplierName}</p>
          <StarRatingInput value={rating} onChange={setRating} />
          <Textarea
            placeholder="Share your experience with this supplier…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="resize-none text-sm"
            rows={3}
          />
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={rating === 0 || submit.isPending}
          >
            {submit.isPending ? "Submitting…" : "Submit Review"}
          </Button>
        </div>
      )}

      {/* Show user's own review if they already reviewed */}
      {canReview && alreadyReviewed && myReview && (
        <div className="border border-amber-200 rounded-xl p-4 space-y-1 bg-amber-50">
          <p className="text-xs font-medium text-amber-700">Your review of {supplierName}</p>
          <ReviewStars rating={myReview.rating} />
          {myReview.comment && <p className="text-xs text-gray-600">{myReview.comment}</p>}
          <p className="text-[10px] text-gray-400">{myReview.createdAt ? new Date(myReview.createdAt).toLocaleDateString() : ""}</p>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="py-6 text-center text-gray-400">
          <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No supplier reviews yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.slice(0, 10).map(r => (
            <div key={r.id} className="border rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800">{r.cafeName || r.cafeOwnerName}</p>
                <ReviewStars rating={r.rating} />
              </div>
              {r.comment && <p className="text-xs text-gray-500">{r.comment}</p>}
              <p className="text-[10px] text-gray-400">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Flavor Distribution Selector ──────────────────────────────────────────────
// Allows the Coffee Owner to distribute the item quantity across available flavors

type FlavorAllocation = { variantId: number; flavorName: string | null; sizeName: string | null; quantity: number; availableQty: number };

function FlavorDistributionRow({ item, allocations, onChange }: {
  item: { productName: string; quantity: number; listingVariants: PackVariantOption[] };
  allocations: FlavorAllocation[];
  onChange: (allocs: FlavorAllocation[]) => void;
}) {
  const totalAllocated = allocations.reduce((s, a) => s + a.quantity, 0);
  const remaining = item.quantity - totalAllocated;
  const isValid = remaining === 0;

  const setQty = (variantId: number, qty: number) => {
    onChange(allocations.map(a => a.variantId === variantId ? { ...a, quantity: Math.max(0, Math.min(qty, a.availableQty)) } : a));
  };

  return (
    <div className="border border-amber-100 rounded-xl p-3 space-y-2 bg-amber-50/40">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">{item.productName}</p>
        <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${isValid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
          {totalAllocated}/{item.quantity}
          {!isValid && remaining > 0 && <span className="ml-1">({remaining} to assign)</span>}
          {!isValid && remaining < 0 && <span className="ml-1">(over by {Math.abs(remaining)})</span>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {allocations.map(a => (
          <div key={a.variantId} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 truncate">
                {[a.flavorName, a.sizeName].filter(Boolean).join(" · ") || "Default"}
                <span className="text-gray-400 ml-1">({a.availableQty} in stock)</span>
              </p>
            </div>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                className="px-2 py-1 hover:bg-gray-100 transition-colors text-gray-500"
                onClick={() => setQty(a.variantId, a.quantity - 1)}
                disabled={a.quantity <= 0}
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="px-2 text-xs font-medium w-8 text-center">{a.quantity}</span>
              <button
                className="px-2 py-1 hover:bg-gray-100 transition-colors text-gray-500"
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
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Quantities must add up to {item.quantity}</span>
        </div>
      )}
    </div>
  );
}

// ── Product Preview Modal (read-only, opened from inside a Pack) ─────────────
// Shows only product information — no purchase, no editing, no navigation away
// from the Pack modal. Reuses the public marketplace product endpoint.

function ProductPreviewModal({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const { data: product, isLoading } = useQuery<ProductWithTaxonomy>({
    queryKey: ["/api/marketplace", productId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/${productId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: productId != null,
  });

  return (
    <Dialog open={productId != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto" data-testid="modal-pack-product-preview">
        <VisuallyHidden>
          <DialogTitle>Product Preview</DialogTitle>
        </VisuallyHidden>
        {isLoading || !product ? (
          <div className="space-y-4 p-2">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="aspect-[16/9] bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center">
              {product.imageUrl
                ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                : <Package className="w-12 h-12 text-gray-200" />
              }
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900" data-testid="text-preview-product-name">{product.name}</h3>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {product.categoryLabel && <Badge variant="secondary" className="text-[10px]">{product.categoryLabel.name}</Badge>}
                {product.subCategoryLabel && <Badge variant="outline" className="text-[10px]">{product.subCategoryLabel.name}</Badge>}
                {product.brandLabel && <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{product.brandLabel.name}</Badge>}
              </div>
            </div>
            {product.description && (
              <p className="text-sm text-gray-500">{product.description}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function PackQuickViewModal() {
  const packId = usePackQuickView((s) => s.packId);
  const close = usePackQuickView((s) => s.close);
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState<"details" | "reviews">("details");
  const [previewProductId, setPreviewProductId] = useState<number | null>(null);
  const { toast } = useToast();
  const addPackItem = useCart((s) => s.addPackItem);
  const faved = useFavorites((s) => (packId != null ? !!s.pack[packId] : false));
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

  // Flavor distribution state: per item, track allocations across available variants
  const [flavorSelections, setFlavorSelections] = useState<Record<number, FlavorAllocation[]>>({});

  // Build default allocations for a pack at a given packQty.
  // Total quantity per item = item.quantity * packQty, distributed across in-stock variants.
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

  // Re-initialise flavor selections whenever the pack or the quantity changes.
  // Quantities always scale as item.quantity × packQty.
  useEffect(() => {
    if (!pack) return;
    setFlavorSelections(buildDefaultAllocations(pack, qty));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack?.id, qty]);

  useEffect(() => { setQty(1); setActiveTab("details"); }, [packId]);

  const individualTotal = pack ? pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) : 0;
  const maxQty = pack ? Math.min(pack.quantityAvailable, pack.maxBuildable) : 0;

  // Check that all flavor distributions are valid:
  // - total allocated quantity must equal item.quantity * packQty
  // - each individual allocation must not exceed its variant's available stock
  const flavorSelectionsValid = useMemo(() => {
    if (!pack) return true;
    return pack.items.every(item => {
      const allocs = flavorSelections[item.id];
      if (!allocs) return true; // single variant — no distribution needed
      const target = item.quantity * qty;
      const totalOk = allocs.reduce((s, a) => s + a.quantity, 0) === target;
      const perVariantOk = allocs.every(a => a.quantity <= a.availableQty);
      return totalOk && perVariantOk;
    });
  }, [pack, flavorSelections, qty]);

  const handleAddToCart = () => {
    if (!pack) return;
    // Build expanded product list that incorporates flavor selections
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
      // Expand per allocated flavor
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

  // Check if any items have multiple in-stock variants available for distribution
  const hasFlavorChoice = pack ? pack.items.some(i => i.listingVariants.filter(v => v.availableQuantity > 0).length > 1) : false;

  return (
    <Dialog open={packId != null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" data-testid="modal-pack-quick-view">
        <VisuallyHidden>
          <DialogTitle>Pack Details</DialogTitle>
        </VisuallyHidden>
        {isLoading || !pack ? (
          <div className="space-y-4 p-2">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hero image */}
            <div className="relative aspect-[16/9] bg-gray-50 rounded-xl overflow-hidden">
              {pack.imageUrl ? (
                <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Layers className="w-14 h-14 text-gray-200" /></div>
              )}
              <button
                className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                onClick={() => togglePack(pack.id)}
                data-testid="button-fav-pack-modal"
              >
                <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
              </button>
            </div>

            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] font-semibold">
                  <Layers className="w-3 h-3 mr-1 inline" />Pack
                </Badge>
                {pack.brandLabels.map(b => (
                  <Badge key={b.id} className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">{b.name}</Badge>
                ))}
                {pack.categoryLabels.map(c => (
                  <Badge key={c.id} variant="outline" className="text-[10px]">{c.name}</Badge>
                ))}
              </div>
              <h2 className="font-bold text-xl text-gray-900" data-testid="text-pack-name">{pack.name}</h2>
              {pack.description && <p className="text-sm text-gray-500 mt-0.5">{pack.description}</p>}
              <SupplierNameWithRating supplierId={pack.supplierId} supplierName={pack.supplierName} />
            </div>

            {/* Price + stock + expiry */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-amber-600" data-testid="text-pack-price">{formatCurrency(pack.price)}</span>
                {individualTotal > pack.price && (
                  <span className="text-sm text-gray-400 line-through">{formatCurrency(individualTotal)}</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{maxQty} disponible{maxQty !== 1 ? "s" : ""}</span>
              {pack.expirationDate && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Calendar className="w-3.5 h-3.5" />
                  Expires {new Date(pack.expirationDate).toLocaleDateString()}
                </div>
              )}
              {pack.packReviewCount > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-medium text-gray-700">{pack.packAvgRating.toFixed(1)}</span>
                  <span className="text-xs text-gray-400">({pack.packReviewCount})</span>
                </div>
              )}
            </div>

            {/* Tabs: Details (items + flavor) | Reviews */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Pack Details</TabsTrigger>
                <TabsTrigger value="reviews">
                  Reviews
                  {pack.packReviewCount > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">{pack.packReviewCount}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-3 space-y-3">
                {/* Included products */}
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
                  {pack.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex items-center gap-3 p-3 w-full text-left hover:bg-gray-50 transition-colors"
                      onClick={() => setPreviewProductId(item.productId)}
                      data-testid={`button-pack-item-preview-${item.id}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.productImageUrl
                          ? <img src={item.productImageUrl} className="w-full h-full object-cover" alt="" />
                          : <Package className="w-4 h-4 text-gray-300" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        {(item.flavorName || item.sizeName) && (
                          <p className="text-xs text-gray-400">{[item.flavorName, item.sizeName].filter(Boolean).join(" · ")}</p>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-500 shrink-0">×{item.quantity}</span>
                    </button>
                  ))}
                </div>

                {/* Flavor distribution — only shown when multiple variants are available */}
                {hasFlavorChoice && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-800">Choose your flavor distribution</p>
                    <p className="text-xs text-gray-500">Distribute the quantities across available flavors for each product.</p>
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
                          />
                        );
                      })
                    }
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reviews" className="mt-3">
                <Tabs defaultValue="pack">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pack">Pack Reviews</TabsTrigger>
                    <TabsTrigger value="supplier">Supplier Reviews</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pack" className="mt-3">
                    <PackReviewsTab packId={pack.id} />
                  </TabsContent>
                  <TabsContent value="supplier" className="mt-3">
                    <SupplierReviewsTab supplierId={pack.supplierId} supplierName={pack.supplierName} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>

            {/* Add to cart */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  className="px-3 py-2 hover:bg-gray-50 transition-colors"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  data-testid="button-decrease-pack-qty"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-4 text-sm font-medium w-10 text-center">{qty}</span>
                <button
                  className="px-3 py-2 hover:bg-gray-50 transition-colors"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  data-testid="button-increase-pack-qty"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <Button
                className="flex-1"
                disabled={maxQty === 0 || !flavorSelectionsValid}
                onClick={handleAddToCart}
                data-testid="button-add-pack-to-cart"
              >
                {!flavorSelectionsValid
                  ? "Complete flavor selection"
                  : `Ajouter au panier · ${formatCurrency(pack.price * qty)}`
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      <ProductPreviewModal productId={previewProductId} onClose={() => setPreviewProductId(null)} />
    </Dialog>
  );
}
