import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers, Minus, Plus, Package, Heart, Star, MapPin, AlertCircle, X, Lock, Sun, Moon,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useThemeStore } from "@/store/theme-store";
import { useSearchLocationStore } from "@/store/search-location-store";
import { calculateDistance, formatDistance } from "@/lib/distance";
import { PackImageGallery } from "@/components/pack-image-gallery";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { ReviewModal } from "@/components/review-modal";
import type { PackDetail, SupplierProductReview, PackVariantOption, ProductWithTaxonomy } from "@shared/schema";

// ── Pack image overlay icons (Fav / Theme / Close) — shared between the
// loading skeleton and the real hero image so both stay reachable the same
// way, anchored to the image container itself rather than to the Dialog
// (task: "Use the existing image container as the positioning reference").
function PackImageTopIcons({ faved, onToggleFav, isDark, onToggleTheme, onClose }: {
  faved: boolean;
  onToggleFav: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-3 right-3 z-20 flex gap-2">
      <button
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 bg-black/40 backdrop-blur-sm"
        onClick={onToggleFav}
        data-testid="button-fav-pack-modal"
      >
        <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white"}`} />
      </button>
      <button
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-black/40 backdrop-blur-sm"
      >
        {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-white" />}
      </button>
      <button
        onClick={onClose}
        aria-label="Close"
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-black/40 backdrop-blur-sm"
      >
        <X className="w-4 h-4 text-white" />
      </button>
    </div>
  );
}

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
    badgeBrand:     dk ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700",
    badgeCat:       dk ? "bg-gray-700/60 text-gray-400 border-gray-700" : "bg-gray-50 text-gray-500 border-gray-200",
    flavorRow:      dk ? "bg-gray-900/50 border-gray-700/40"  : "bg-white border-gray-100",
    inputCls:       dk ? "bg-gray-700 border-gray-600 text-gray-200 placeholder:text-gray-500" : "",
    cartFooter:     dk ? "bg-gray-900 border-gray-800"        : "bg-white border-gray-100",
  };
}

// ── Pack Reviews (opened via the Star icon on the pack image) ────────────────
// Renders the shared Avis modal (client/src/components/review-modal.tsx) —
// the same component Product Detail uses (task: "Use One Shared Avis Modal
// for Products and Packs") — so both have one visual/structural source of
// truth. This component is only the pack-specific data adapter: its own
// query/mutation/cache-invalidation against /api/reviews/pack/:packId,
// exactly as before: only the presentation shell changed.

function PackReviewsModal({
  open, onClose, packId, packName,
}: {
  open: boolean;
  onClose: () => void;
  packId: number;
  packName: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const canReview = user?.role === "CAFE_OWNER" && (user as any).status === "approved";

  const { data: reviews = [] } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/pack", packId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/pack/${packId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open && !!packId,
  });

  const myReview = user ? reviews.find(r => r.cafeId === user.id) : undefined;

  const submit = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string }) =>
      apiRequest("POST", `/api/reviews/pack/${packId}`, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reviews/pack", packId] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/packs"] });
    },
  });

  const reviewRows = useMemo(() => reviews.map(r => ({
    id: r.id,
    cafeId: r.cafeId,
    cafeOwnerName: r.cafeOwnerName,
    cafeName: r.cafeName,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
  })), [reviews]);

  return (
    <ReviewModal
      open={open}
      onClose={onClose}
      targetName={packName}
      reviewTypeLabel="Avis sur le pack"
      existingReviews={reviewRows}
      myReview={myReview ? { rating: myReview.rating, comment: myReview.comment } : null}
      onSubmit={async (rating, comment) => { await submit.mutateAsync({ rating, comment }); }}
      isSubmitting={submit.isPending}
      canReview={canReview}
    />
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
              <p className={`text-[10px] ${t.textSubtle}`}>{a.availableQty} en stock</p>
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
  const { isDark, toggle } = useThemeStore();

  // Swipe-to-dismiss (task: "Standardize Swipe-to-Dismiss Across All
  // Modals Using the Maintenance 'Signaler' Modal as the Reference") —
  // same shared hook, same call signature as every other modal in the app
  // (e.g. maintenance-blacklist-modal.tsx's own useScrollDismiss(open,
  // onClose, undefined, true)). Close button / backdrop / Escape still
  // call onClose directly, unchanged — only the swipe/wheel gesture goes
  // through requestDismiss's animated exit, matching the reference's own
  // actual behavior exactly (not an invented "improvement").
  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(productId != null, onClose, undefined, true);

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
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        data-testid="modal-pack-product-preview"
      >
        <VisuallyHidden><DialogTitle>Product Preview</DialogTitle></VisuallyHidden>

        <div className={`flex flex-col max-h-[85vh] overflow-hidden transition-colors duration-200 ${bg}`}>

          {/* ── Fixed header ── */}
          <div className={`shrink-0 ${bg} px-5 pt-2 pb-4`}>
            <ModalGrabber isDark={dk} />
            <div className="flex items-center justify-between mb-4 mt-2">
              
                <button
                onClick={toggle}
                aria-label="Toggle theme"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
              </button>
              <span className={`text-[13px] font-semibold tracking-tight ${textPrimary}`}>Product Preview</span>
              <button
                onClick={onClose}
                aria-label="Close"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}
              >
                <X className="w-4 h-4" />
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
            onWheel={onBodyWheel}
            onTouchStart={onBodyTouchStart}
            onTouchMove={onBodyTouchMove}
            onTouchEnd={onBodyTouchEnd}
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

export function PackQuickViewModal({ previewPack, previewOpen, onPreviewClose }: {
  // Additive — supports a second, independent instance of this exact same
  // component (e.g. the Supplier's own "Open Pack Detail Live Preview"
  // button) rendered with a locally-built, not-yet-saved PackDetail object
  // instead of the real Zustand store + server fetch. Left undefined, this
  // component behaves exactly as before (the Coffee Owner Shop's own
  // singleton instance in marketplace-layout.tsx never passes these).
  previewPack?: PackDetail;
  previewOpen?: boolean;
  onPreviewClose?: () => void;
} = {}) {
  const isPreview = previewPack != null;

  const packId = usePackQuickView((s) => s.packId);
  const editCartItem = usePackQuickView((s) => s.editCartItem);
  const onSave = usePackQuickView((s) => s.onSave);
  const replaceTargetPackId = usePackQuickView((s) => s.replaceTargetPackId);
  const clearReplaceTarget = usePackQuickView((s) => s.clearReplaceTarget);
  const storeClose = usePackQuickView((s) => s.close);
  const close = isPreview ? (onPreviewClose ?? (() => {})) : storeClose;
  const isEditing = !isPreview && editCartItem != null;

  // Previous/Next Product navigation — browses the Shop's own currently
  // filtered pack list (navIds), kept live-synced by browse-products.tsx;
  // never available in preview mode (a locally-built draft has no real
  // Shop context). Navigates in place via navigateTo (not open/close), so
  // the modal's own opening animation never replays and the gesture/
  // dismissal state isn't disturbed. If the current pack isn't found in
  // navIds (e.g. opened from a different page's context), both buttons are
  // simply hidden rather than guessing — task: "Navigate Between Mapped
  // Products and Packs Without Closing the Detail Modal".
  const navIds = usePackQuickView((s) => s.navIds);
  const navigateToPack = usePackQuickView((s) => s.navigateTo);
  const navCurrentIndex = !isPreview && navIds ? navIds.indexOf(packId as number) : -1;
  const prevPackId = navCurrentIndex > 0 ? navIds![navCurrentIndex - 1] : null;
  const nextPackId = navCurrentIndex !== -1 && navIds && navCurrentIndex < navIds.length - 1 ? navIds[navCurrentIndex + 1] : null;
  const hasPackNav = !isPreview && navCurrentIndex !== -1 && !!navIds && navIds.length > 1;

  const [qty, setQty]           = useState(1);
  const [previewProductId, setPreviewProductId] = useState<number | null>(null);
  const [packReviewsOpen, setPackReviewsOpen] = useState(false);
  // When editing an existing cart line, the pack-loaded effect below must seed
  // flavorSelections from the cart's actual saved distribution once, instead
  // of the auto-computed default — subsequent qty changes made by the user
  // inside the modal still use the normal auto-distribute behavior.
  const seedFromCartRef = useRef(false);

  // ── Global theme ──────────────────────────────────────────────────────────
  const { isDark, toggle } = useThemeStore();
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

  const { toast } = useToast();
  const addPackItem = useCart((s) => s.addPackItem);
  const setPackItem = useCart((s) => s.setPackItem);
  const replacePackItem = useCart((s) => s.replacePackItem);
  const faved      = useFavorites((s) => (!isPreview && packId != null ? !!s.pack[packId] : false));
  const togglePack = useFavorites((s) => s.togglePack);

  const { data: queriedPack, isLoading: queryLoading } = useQuery<PackDetail>({
    queryKey: ["/api/marketplace/packs", packId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/packs/${packId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isPreview && packId != null,
  });
  const pack = isPreview ? previewPack : queriedPack;
  const isLoading = isPreview ? false : queryLoading;

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

  // Rebuilds the per-item flavor allocations from a saved cart distribution
  // (used only the first time the modal loads in edit mode) instead of the
  // auto-computed default. Matches cart rows to a pack item's in-stock
  // variant options by (productId, flavorName, sizeName); if the same
  // productId legitimately occupies more than one pack slot, each cart row
  // is consumed at most once so quantities aren't double-counted.
  function buildAllocationsFromCart(p: typeof pack, cartProducts: { productId: number; flavorName: string | null; sizeName: string | null; quantity: number }[]): Record<number, FlavorAllocation[]> {
    if (!p) return {};
    const remaining = cartProducts.map(c => ({ ...c }));
    const result: Record<number, FlavorAllocation[]> = {};
    for (const item of p.items) {
      const inStockVariants = item.listingVariants.filter(v => v.availableQuantity > 0);
      if (inStockVariants.length <= 1) continue;
      const allocs: FlavorAllocation[] = inStockVariants.map(v => ({
        variantId: v.variantId, flavorName: v.flavorName, sizeName: v.sizeName, quantity: 0, availableQty: v.availableQuantity,
      }));
      for (const alloc of allocs) {
        const matchIndex = remaining.findIndex(c =>
          c.productId === item.productId &&
          (c.flavorName ?? null) === (alloc.flavorName ?? null) &&
          (c.sizeName ?? null) === (alloc.sizeName ?? null)
        );
        if (matchIndex !== -1) {
          alloc.quantity = remaining[matchIndex].quantity;
          remaining.splice(matchIndex, 1);
        }
      }
      result[item.id] = allocs;
    }
    return result;
  }

  useEffect(() => {
    if (!pack) return;
    if (seedFromCartRef.current && editCartItem) {
      setFlavorSelections(buildAllocationsFromCart(pack, editCartItem.includedProducts));
      seedFromCartRef.current = false;
      return;
    }
    setFlavorSelections(buildDefaultAllocations(pack, qty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack?.id, qty]);

  useEffect(() => {
    if (editCartItem) {
      setQty(editCartItem.quantity);
      seedFromCartRef.current = true;
    } else {
      setQty(1);
      seedFromCartRef.current = false;
    }
    setPackReviewsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  const individualTotal = pack ? pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) : 0;
  const maxQty = pack ? Math.min(pack.quantityAvailable, pack.maxBuildable) : 0;

  // Distance — identical computation/guard to PackCardTile (browse-products.tsx):
  // null (omitted, never fabricated) unless both the user's search location and
  // the pack's supplier coordinates are present and valid.
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const distance = useMemo(() => {
    if (!pack || !searchLocation || !(pack as any).supplierLat || !(pack as any).supplierLng) return null;
    const lat = parseFloat((pack as any).supplierLat);
    const lng = parseFloat((pack as any).supplierLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return calculateDistance(parseFloat(searchLocation.lat), parseFloat(searchLocation.lng), lat, lng);
  }, [pack, searchLocation]);

  // Expiry/stock styling — mirrors PackCardTile's exact treatment (amber,
  // no separate icon for expiry, "Exp: <day> <month short> <year>").
  const priceColor = t.dk ? "text-amber-400" : "text-amber-600";
  const expiryLabel = pack?.expirationDate
    ? new Date(pack.expirationDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

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
    // Store the exact distribution selected for the packs being added. The cart line
    // owns the current total distribution; it must not be multiplied again by qty.
    const includedProducts = pack.items.flatMap(item => {
      const allocs = flavorSelections[item.id];
      if (!allocs) {
        return [{
          productId: item.productId,
          productName: item.productName,
          productImageUrl: item.productImageUrl ?? null,
          brandName: item.brandName ?? null,
          categoryName: item.categoryName ?? null,
          subCategoryName: item.subCategoryName ?? null,
          flavorName: item.flavorName,
          sizeName: item.sizeName,
          quantity: item.quantity * qty,
        }];
      }
      return allocs
        .filter(a => a.quantity > 0)
        .map(a => ({
          productId: item.productId,
          productName: item.productName,
          productImageUrl: item.productImageUrl ?? null,
          brandName: item.brandName ?? null,
          categoryName: item.categoryName ?? null,
          subCategoryName: item.subCategoryName ?? null,
          flavorName: a.flavorName,
          sizeName: a.sizeName,
          quantity: a.quantity,
        }));
    });

    const packCartData = {
      packId: pack.id,
      packName: pack.name,
      packImageUrl: pack.imageUrl ?? null,
      supplierId: pack.supplierId,
      supplierName: pack.supplierName,
      unitPrice: pack.price,
      includedProducts,
    };

    if (isEditing) {
      if (onSave) {
        // Draft-only edit (e.g. opened from the Order Summary modal): the
        // caller owns where this goes, so the real Cart is never touched.
        onSave({ ...packCartData, quantity: qty });
        toast({ title: "Commande mise à jour", description: `${pack.name} × ${qty}` });
      } else {
        // Edit flow from the Cart page: replace the existing cart line in
        // place. Never adds a second pack, never merges onto the previous
        // quantity/distribution.
        setPackItem(packCartData, qty);
        toast({ title: "Panier mis à jour", description: `${pack.name} × ${qty}` });
      }
    } else if (replaceTargetPackId != null) {
      // Arrived here via the Cart's "Choisir un autre fournisseur" action on a Pack
      // line the supplier cancelled — this Pack replaces that line instead of adding
      // a new one (see hooks/use-pack-quick-view.ts armReplace).
      replacePackItem(replaceTargetPackId, packCartData, qty);
      toast({ title: "Pack remplacé", description: `${pack.name} × ${qty} — ${pack.supplierName}` });
      clearReplaceTarget();
    } else {
      addPackItem(packCartData, qty);
      toast({ title: "Ajouté au panier", description: `${pack.name} × ${qty}` });
    }
    close();
  };

  const hasFlavorChoice = pack ? pack.items.some(i => i.listingVariants.filter(v => v.availableQuantity > 0).length > 1) : false;

  // Scroll-direction dismissal (scroll down, back up, then up again past the
  // top closes the modal with a slide-down + fade) — shared with the Product
  // Detail Modal via useScrollDismiss, see client/src/hooks/use-scroll-dismiss.ts
  // for the full behavior description.
  const dialogOpen = isPreview ? !!previewOpen : packId != null;
  const {
    onBodyWheel: handleBodyWheel,
    onBodyTouchStart: handleBodyTouchStart,
    onBodyTouchMove: handleBodyTouchMove,
    onBodyTouchEnd: handleBodyTouchEnd,
    dismissContentStyle,
    dismissOverlayStyle,
  } = useScrollDismiss(dialogOpen, close, undefined, true);

  return (
    <Dialog open={isPreview ? !!previewOpen : packId != null} onOpenChange={(open) => { if (!open) close(); }}>
      {/*
        DialogContent: flex column, no inner scroll (scroll is on the inner div),
        p-0 to let our header/body/footer control all spacing,
        hide the default shadcn close button (we use our own in the header).
      */}
      <DialogContent
        className={`max-w-2xl sm:w-[calc(100%-2rem)] max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0 border-0 shadow-2xl rounded-3xl [&>button:last-child]:hidden ${t.modalBg}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        data-testid="modal-pack-quick-view"
      >
        <VisuallyHidden>
          <DialogTitle>Pack Details</DialogTitle>
        </VisuallyHidden>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div
          className="flex-1 min-h-0 overflow-y-auto pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          onWheel={handleBodyWheel}
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
        >
          {isLoading || !pack ? (
            <div className="px-3 sm:px-5 py-6 space-y-4">
              <div className={`relative h-48 w-full rounded-2xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`}>
                <ModalGrabber isDark={isDark} onImage />
                <PackImageTopIcons
                  faved={false}
                  onToggleFav={() => {}}
                  isDark={isDark}
                  onToggleTheme={toggle}
                  onClose={close}
                />
              </div>
              <div className={`h-6 w-2/3 rounded-xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
              <div className={`h-4 w-1/2 rounded-xl animate-pulse ${t.dk ? "bg-gray-800" : "bg-gray-100"}`} />
            </div>
          ) : (
            <>
              {/* ── Hero image — flush with the modal's own top corners,
                  fixed height, overlay icons anchored to the image container
                  itself (Fav/Theme/Close top-right, Avis bottom-right) so
                  they scroll away together with the image instead of
                  staying pinned to the viewport. The existing thumbnail
                  gallery beneath it is untouched (same component, same
                  behavior), only given its own explicit horizontal padding
                  now that the scroll container's ambient padding has been
                  removed (every other section below already carries its own
                  independent px-3/sm:px-5, so this is the only consumer
                  that actually relied on it). ── */}
              <div>
                <PackImageGallery
                  imageUrl={pack.imageUrl}
                  imageUrls={pack.imageUrls}
                  alt={pack.name}
                  mainClassName={`relative w-full h-80 sm:h-[420px] shrink-0 ${t.imgBg}`}
                  mainRoundedClassName="rounded-t-3xl"
                  emptyClassName={t.emptyIcon}
                  thumbnailClassName="px-3 sm:px-5 pt-1"
                  carousel
                  overlay={
                    <>
                      <ModalGrabber isDark={isDark} onImage />
                      <PackImageTopIcons
                        faved={faved}
                        onToggleFav={isPreview ? () => {} : () => togglePack(pack.id)}
                        isDark={isDark}
                        onToggleTheme={toggle}
                        onClose={close}
                      />
                      {/* Avis — hidden in preview mode (the Supplier's
                          not-yet-saved draft has no real review history to
                          open, and no real packId to fetch reviews for). */}
                      {!isPreview && (
                        <div className="absolute bottom-3 right-3 z-20">
                          <button
                            onClick={() => setPackReviewsOpen(true)}
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 bg-black/40 backdrop-blur-sm"
                            data-testid="button-open-pack-reviews"
                            title="Avis"
                          >
                            <Star className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      )}
                    </>
                  }
                />
              </div>

              {/* ── Pack info section ──────────────────────────────────── */}
              <div className="px-3 sm:px-5 pt-5 pb-4 space-y-3">
                {/* Pack name + rating (inline, next to the name) on the left;
                    Previous/Next Product navigation buttons top-right — the
                    rating used to sit in that top-right slot (pushed there by
                    justify-between) and has been moved inline with the name to
                    make room, per task: "Navigate Between Mapped Products and
                    Packs Without Closing the Detail Modal". The Avis trigger
                    itself (image overlay, bottom-right) and its behavior are
                    unchanged — only this read-only rating display moved. */}
                <div className="flex items-start justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h2 className={`text-xl font-extrabold leading-tight min-w-0 ${t.textPrimary}`} data-testid="text-pack-name">
                      {pack.name}
                    </h2>
                    {pack.packReviewCount > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className={`text-sm font-semibold ${t.textPrimary}`}>{pack.packAvgRating.toFixed(1)}</span>
                        <span className={`text-xs ${t.textMuted}`}>({pack.packReviewCount})</span>
                      </div>
                    )}
                  </div>
                  {hasPackNav && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => prevPackId != null && navigateToPack(prevPackId)}
                        disabled={prevPackId == null}
                        aria-label="Pack précédent"
                        title="Pack précédent"
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${t.dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
                        data-testid="button-pack-nav-prev"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nextPackId != null && navigateToPack(nextPackId)}
                        disabled={nextPackId == null}
                        aria-label="Pack suivant"
                        title="Pack suivant"
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${t.dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
                        data-testid="button-pack-nav-next"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Badges row (mapped Pack/brand/category) */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className={`text-[10px] font-semibold border px-2 py-0.5 ${t.badgePack}`}>
                    <Layers className="w-3 h-3 mr-1 inline" />Pack
                  </Badge>
                 
                  {pack.categoryLabels.map(c => (
                    <Badge key={c.id} className={`text-[10px] border px-2 py-0.5 ${t.badgeCat}`}>{c.name}</Badge>
                  ))}
                   {pack.brandLabels.map(b => (
                    <Badge key={b.id} className={`text-[10px] border px-2 py-0.5 ${t.badgeBrand}`}>{b.name}</Badge>
                  ))}
                </div>

                {/* Description */}
                {pack.description && (
                  <p className={`text-sm leading-relaxed ${t.textMuted}`}>{pack.description}</p>
                )}

                {/* Supplier */}
                <SupplierNameWithRating supplierId={pack.supplierId} supplierName={pack.supplierName} isDark={isDark} />

                {/* Price / distance / stock / expiry row — expiry and stock
                    now match PackCardTile's exact treatment (amber, same
                    "Exp: <day> <month> <year>" format, Package icon for
                    stock); distance reuses the same calculation/guard as
                    the mapped cards and is simply omitted (never invented)
                    when no valid search location or supplier coordinates
                    exist. Pack rating moved up next to the name (above),
                    no longer duplicated here. */}
                <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t ${t.divider}`}>
                  {/* Price */}
                  <div className="flex items-baseline gap-2.5">
                    <span
                      className={`text-2xl font-extrabold ${t.dk ? "text-amber-400" : "text-amber-600"}`}
                      data-testid="text-pack-price"
                    >
                      {fmt(pack.price)}
                    </span>
                    {individualTotal > pack.price && (
                      <span className={`text-2xl line-through ${t.textMuted}`}>{fmt(individualTotal)}</span>
                    )}
                  </div>

                  {/* Distance */}
                  {distance != null && (
                    <span className={`flex items-center gap-0.5 text-sm ${t.textMuted}`}>
                      <MapPin className="w-3.5 h-3.5 shrink-0" />{formatDistance(distance)}
                    </span>
                  )}

                  {/* Stock */}
                  <span className={`flex items-center gap-1 text-sm font-medium ${priceColor}`}>
                    <Package className="w-3.5 h-3.5 shrink-0" />
                    {maxQty} Pack disponible{maxQty !== 1 ? "s" : ""}
                  </span>

                  {/* Expiry */}
                  {expiryLabel && (
                    <span className={`text-sm font-medium ${priceColor}`}>Exp: {expiryLabel}</span>
                  )}
                </div>
              </div>

              {/* ── Pack Details content ──────────────────────────────── */}
              <div className="px-3 sm:px-5 pt-4 pb-4">
                <div className="space-y-4">

                    {/* Included products */}
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${t.textMuted}`}>
                        Produits inclus
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
                              {(item.listingVariants.length > 0 || item.flavorName || item.sizeName) && (
                                <p className={`text-xs mt-0.5 ${t.textMuted}`}>
                                   {[
                                     item.listingVariants.map(v => v.flavorName).filter((name): name is string => !!name).join(" • ") || item.flavorName,
                                     item.sizeName,
                                   ].filter(Boolean).join(" · ")}
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
                          <p className={`text-sm font-bold ${t.textPrimary}`}>Choisissez la répartition des parfums</p>
                          <p className={`text-xs mt-0.5 ${t.textMuted}`}>Répartissez les quantités entre les parfums disponibles pour chaque produit.</p>
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
              </div>

              {/* Bottom spacer so content isn't hidden behind fixed footer */}
              <div className="h-4" />
            </>
          )}
        </div>

        {/* ── Fixed footer: qty stepper + Add to Cart ──────────────────────── */}
        {pack && !isLoading && (
          <div className={`shrink-0 border-t px-3 sm:px-5 py-4 transition-colors ${t.cartFooter}`}>
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
                onClick={isPreview
                  ? () => toast({ title: "Mode aperçu", description: "Aucune commande réelle n'est créée depuis cette prévisualisation." })
                  : handleAddToCart}
                data-testid="button-add-pack-to-cart"
              >
                {maxQty === 0
                  ? "Out of stock"
                  : !flavorSelectionsValid
                    ? "Complete flavor selection"
                    : isEditing
                      ? `Mettre à jour · ${fmt(pack.price * qty)}`
                      : `Ajouter au panier · ${fmt(pack.price * qty)}`
                }
              </button>
            </div>
          </div>
        )}
      </DialogContent>

      <ProductPreviewModal productId={previewProductId} onClose={() => setPreviewProductId(null)} />

      {!isPreview && pack && (
        <PackReviewsModal
          open={packReviewsOpen}
          onClose={() => setPackReviewsOpen(false)}
          packId={pack.id}
          packName={pack.name}
        />
      )}
    </Dialog>
  );
}
