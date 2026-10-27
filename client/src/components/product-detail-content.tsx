import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Package, Store, Minus, Plus, ShoppingCart, CheckCircle2,
  Lock, AlertTriangle, LogIn, MapPin, Star, MessageSquarePlus, X, Navigation, Tag, Sun, Moon, Zap, Heart,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useToast } from "@/hooks/use-toast";
import { useQuickView } from "@/hooks/use-quick-view";
import type { MarketplaceProduct, MarketplaceListing, MarketplaceVariant, ListingPromotion } from "@shared/schema";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { ReviewModal } from "@/components/review-modal";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { PackImageGallery } from "@/components/pack-image-gallery";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useCoverZoomStyle, computeCoverZoomScale, getAdjustmentFor } from "@/lib/image-adjustment";

// ── Promotion helpers ─────────────────────────────────────────────────────────

// Non-price promotions — shown as badges next to the supplier name
const SUPPLIER_BADGE_TYPES = new Set([
  'FREE_SHIPPING', 'GIFT', 'BUY_X_GET_Y', 'QUANTITY_TIER', 'MIN_ORDER_AMOUNT',
]);

// Price-affecting promotions — shown per-variant with promotional pricing
const VARIANT_PRICE_TYPES = new Set([
  'PERCENTAGE', 'FIXED_AMOUNT', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER',
]);

function calcPromoPrice(basePrice: number, promo: ListingPromotion): number | null {
  if (['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(promo.type)) {
    return Math.max(0, Math.round(basePrice * (1 - promo.discountValue / 10000)));
  }
  if (promo.type === 'FIXED_AMOUNT') {
    // discountValue is in milli-DT; price is in cents (1 DT = 100 cents = 1000 milli-DT → 1 cent = 10 milli-DT)
    return Math.max(0, basePrice - Math.round(promo.discountValue / 10));
  }
  return null;
}

// ── Haversine distance (km) ───────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Access helper ─────────────────────────────────────────────────────────────

function useAccess(user: any) {
  if (!user) return { isVisitor: true, isPending: false, hasCommercial: false };
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user?.role)) return { isVisitor: false, isPending: false, hasCommercial: true };
  const approved = user?.role === 'CAFE_OWNER' && user?.status === 'approved';
  return { isVisitor: false, isPending: !approved, hasCommercial: approved };
}

// ── Stars display ─────────────────────────────────────────────────────────────

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25"}`} />
      ))}
    </div>
  );
}

// ── Variant Row ───────────────────────────────────────────────────────────────

function VariantRow({
  variant, listing, product, promotions = [], isDark = false,
}: {
  variant: MarketplaceVariant;
  listing: MarketplaceListing;
  product: MarketplaceProduct;
  promotions?: ListingPromotion[];
  isDark?: boolean;
}) {
  const fmt = useFormatCurrency();
  const { addItem, replaceItem, getItemQuantity } = useCart();
  const { toast } = useToast();
  // Set only when this modal was opened from the Cart's "Choisir un autre fournisseur"
  // action on a line the supplier cancelled — see hooks/use-quick-view.ts. Every variant
  // row across every supplier reads the same target, so the quantity always defaults to
  // what was originally requested and the row matching the original flavor/size is
  // highlighted, no matter which supplier the Coffee Owner ends up picking.
  const replaceTarget = useQuickView((s) => s.replaceTarget);
  const clearReplaceTarget = useQuickView((s) => s.clearReplaceTarget);
  const closeQuickView = useQuickView((s) => s.close);
  const [qty, setQty] = useState(replaceTarget?.quantity ?? 1);
  const inCart = getItemQuantity(listing.id, variant.flavorId, variant.sizeId);
  const outOfStock = variant.quantity <= 0;
  const isReplacementMatch = !!replaceTarget
    && (replaceTarget.flavorName ?? null) === (variant.flavorName ?? null)
    && (replaceTarget.sizeName ?? null) === (variant.sizeName ?? null);

  // Best price-affecting promotion for this listing
  const bestPricePromo = useMemo(() => {
    const eligible = promotions.filter(p => VARIANT_PRICE_TYPES.has(p.type));
    if (!eligible.length) return null;
    const pct = eligible.filter(p => ['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(p.type));
    if (pct.length) return pct.reduce((best, p) => p.discountValue > best.discountValue ? p : best, pct[0]);
    return eligible[0];
  }, [promotions]);

  const promoPrice = bestPricePromo ? calcPromoPrice(variant.price, bestPricePromo) : null;

  const handleAdd = () => {
    if (outOfStock) return;
    const newItem = {
      listingId: listing.id, flavorId: variant.flavorId, sizeId: variant.sizeId,
      productId: product.id, productName: product.name, productImageUrl: product.imageUrl ?? null,
      productCategory: product.category ?? "", brandName: product.brandLabel?.name ?? null,
      categoryName: product.categoryLabel?.name ?? product.category ?? null,
      subCategoryName: product.subCategoryLabel?.name ?? null,
      supplierId: listing.supplierId,
      supplierName: listing.supplierName, flavorName: variant.flavorName ?? null,
      sizeName: variant.sizeName ?? null, unitPrice: promoPrice ?? variant.price,
    };
    if (replaceTarget) {
      replaceItem(
        { listingId: replaceTarget.listingId, flavorId: replaceTarget.flavorId, sizeId: replaceTarget.sizeId },
        newItem,
        qty,
      );
      toast({ title: "Fournisseur remplacé", description: `${product.name}${variant.flavorName ? ` – ${variant.flavorName}` : ""}${variant.sizeName ? ` (${variant.sizeName})` : ""} × ${qty} — ${listing.supplierName}` });
      clearReplaceTarget();
      closeQuickView();
      return;
    }
    addItem(newItem, qty);
    toast({ title: "Ajouté au panier", description: `${product.name}${variant.flavorName ? ` – ${variant.flavorName}` : ""}${variant.sizeName ? ` (${variant.sizeName})` : ""} × ${qty}` });
  };

  const baseLabel = [variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "Par défaut";
  const label = outOfStock ? baseLabel : `${baseLabel} · ${variant.quantity} en stock`;

  const borderCls   = isDark ? "border-gray-700/40"  : "border-border/40";
  const labelCls    = isDark ? "text-white"           : "";
  const priceCls    = isDark ? "text-blue-400"        : "";
  const origCls     = isDark ? "text-gray-500"        : "text-muted-foreground";
  const stepBorder  = isDark ? "border-gray-700"      : "border-border";
  const stepHover   = isDark ? "hover:bg-gray-700"    : "hover:bg-secondary";
  const stepText    = isDark ? "text-gray-200"        : "";

  // Promo badge rendered below the variant label
  const promoBadge = bestPricePromo && (
    <span className="inline-flex items-center gap-1 bg-rose-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5">
      <Zap className="w-2.5 h-2.5" />{bestPricePromo.label}
    </span>
  );

  // Shown only in replacement mode, on the row matching the originally cancelled
  // flavor/size — helps the Coffee Owner pick the equivalent variant from the new
  // supplier without having to remember the exact configuration themselves.
  const replacementBadge = isReplacementMatch && (
    <span className="inline-flex items-center gap-1 bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5">
      <CheckCircle2 className="w-2.5 h-2.5" />Correspond à votre sélection
    </span>
  );

  // Price display: promotional (large) + original (strikethrough) when promo active
  const priceDisplay = (shrink = true) => (
    <div className={`text-right ${shrink ? "shrink-0" : ""}`}>
      <div className={`font-bold text-base ${priceCls}`}>
        {fmt(promoPrice ?? variant.price)}
      </div>
      {promoPrice != null && (
        <div className={`text-xs line-through leading-tight ${origCls}`}>
          {fmt(variant.price)}
        </div>
      )}
    </div>
  );

  return (
    <div className={`py-3 border-b ${borderCls} last:border-0 ${isReplacementMatch ? "-mx-2 px-2 rounded-xl ring-1 ring-emerald-500/40 bg-emerald-500/5" : ""}`}>
      {/* Desktop / tablet: single-row layout (sm and up) */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${labelCls}`}>{label}</span>
          {outOfStock && <span className="ml-2 text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md">Rupture de stock</span>}
          {promoBadge && <div>{promoBadge}</div>}
          {replacementBadge && <div>{replacementBadge}</div>}
        </div>
        {priceDisplay()}
        {!outOfStock && (
          <div className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center border ${stepBorder} rounded-lg overflow-hidden`}>
              <button className={`px-2 py-1.5 ${stepHover} transition-colors ${stepText}`} onClick={() => setQty(q => Math.max(1, q - 1))}><Minus className="w-3 h-3" /></button>
              <span className={`px-3 text-sm font-medium w-8 text-center ${stepText}`}>{qty}</span>
              <button className={`px-2 py-1.5 ${stepHover} transition-colors ${stepText}`} onClick={() => setQty(q => Math.min(variant.quantity, q + 1))}><Plus className="w-3 h-3" /></button>
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              className={`gap-1.5 ${inCart > 0 ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}
              data-testid={`button-add-variant-${listing.id}-${variant.flavorId ?? 0}-${variant.sizeId ?? 0}`}
            >
              {inCart > 0 ? <><CheckCircle2 className="w-3.5 h-3.5" />{inCart} dans le panier</> : <><ShoppingCart className="w-3.5 h-3.5" />Ajouter</>}
            </Button>
          </div>
        )}
      </div>

      {/* Mobile: two-line layout */}
      <div className="flex flex-col gap-2 sm:hidden">
        {/* Line 1: label + promo badge */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${labelCls}`}>{label}</span>
            {outOfStock && <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md shrink-0">Rupture de stock</span>}
          </div>
          {promoBadge}
          {replacementBadge}
        </div>
        {/* Line 2: price + qty + add */}
        {!outOfStock && (
          <div className="flex items-center justify-between gap-2">
            {priceDisplay(false)}
            <div className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center border ${stepBorder} rounded-lg overflow-hidden`}>
                <button className={`px-2 py-1.5 ${stepHover} transition-colors ${stepText}`} onClick={() => setQty(q => Math.max(1, q - 1))}><Minus className="w-3 h-3" /></button>
                <span className={`px-3 text-sm font-medium w-8 text-center ${stepText}`}>{qty}</span>
                <button className={`px-2 py-1.5 ${stepHover} transition-colors ${stepText}`} onClick={() => setQty(q => Math.min(variant.quantity, q + 1))}><Plus className="w-3 h-3" /></button>
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                className={`gap-1.5 ${inCart > 0 ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}
                data-testid={`button-add-variant-${listing.id}-${variant.flavorId ?? 0}-${variant.sizeId ?? 0}`}
              >
                {inCart > 0 ? <><CheckCircle2 className="w-3.5 h-3.5" />{inCart} dans le panier</> : <><ShoppingCart className="w-3.5 h-3.5" />Ajouter</>}
              </Button>
            </div>
          </div>
        )}
        {outOfStock && priceDisplay(false)}
      </div>
    </div>
  );
}

// ── Supplier Section ──────────────────────────────────────────────────────────

function SupplierSection({
  listing, product, visibleVariants, reviewStats, distanceKm, promotions = [], isDark = false,
}: {
  listing: MarketplaceListing;
  product: MarketplaceProduct;
  visibleVariants: MarketplaceVariant[];
  reviewStats?: { avgRating: number; total: number };
  distanceKm?: number;
  promotions?: ListingPromotion[];
  isDark?: boolean;
}) {
  const cardBorder = isDark ? "bg-gray-800 border-gray-700/60" : "border-border/50";
  const headerBg   = isDark ? "bg-gray-800/50"   : "bg-secondary/30";
  const bodyBg     = isDark ? "bg-gray-800"       : "";
  const logoBg     = isDark ? "bg-gray-700"       : "bg-primary/10";
  const logoIcon   = isDark ? "text-gray-400"     : "text-primary";
  const nameCls    = isDark ? "text-white font-semibold" : "font-semibold";
  const subCls     = isDark ? "text-gray-400"     : "text-muted-foreground";

  // Supplier-level badges: non-price promotions shown next to the supplier name
  const supplierBadgePromos = promotions.filter(p => SUPPLIER_BADGE_TYPES.has(p.type));

  // Price-affecting promotions are passed to each VariantRow
  const pricePromos = promotions.filter(p => VARIANT_PRICE_TYPES.has(p.type));

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${cardBorder}`}>
      <div className={`${headerBg} px-5 py-4 flex items-center gap-3`}>
        <div className={`w-9 h-9 rounded-xl overflow-hidden ${logoBg} flex items-center justify-center shrink-0`}>
          {listing.storeLogoUrl
            ? <img src={listing.storeLogoUrl} alt="" className="w-full h-full object-cover" />
            : <Store className={`w-5 h-5 ${logoIcon}`} />
          }
        </div>
        <div className="min-w-0 flex-1">
          {/* Supplier name + supplier-level promo badges on the same line */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={nameCls}>{listing.supplierName}</p>
            {supplierBadgePromos.map((promo, i) => (
              <span
                key={`${promo.promotionId}-${i}`}
                className="inline-flex items-center gap-1 bg-blue-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
              >
                <Zap className="w-2.5 h-2.5" />{promo.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <p className={`text-xs ${subCls}`}>{visibleVariants.length} variante{visibleVariants.length !== 1 ? "s" : ""}</p>
            {distanceKm !== undefined && (
              <span className={`text-xs ${subCls} flex items-center gap-0.5`}>
                <MapPin className="w-3 h-3 shrink-0" />{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}
              </span>
            )}
            {reviewStats && reviewStats.total > 0 && (
              <div className="flex items-center gap-1">
                <Stars rating={reviewStats.avgRating} size="xs" />
                <span className={`text-xs ${subCls}`}>({reviewStats.total})</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={`px-5 ${bodyBg}`}>
        {visibleVariants.map((v, idx) => (
          <VariantRow
            key={`${v.flavorId ?? 0}-${v.sizeId ?? 0}-${idx}`}
            variant={v}
            listing={listing}
            product={product}
            promotions={pricePromos}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
}

// ── Commercial Gate ───────────────────────────────────────────────────────────

function CommercialGate({ isPending }: { isPending: boolean }) {
  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-8 text-center space-y-4">
      <div className="w-14 h-14 bg-amber-400 dark:bg-amber-500/80 rounded-2xl flex items-center justify-center mx-auto">
        <Lock className="w-7 h-7 text-amber-600 dark:text-amber-950" />
      </div>
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white text-lg">Accès commercial requis</h3>
        {isPending ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium text-sm">Votre compte est en attente d'approbation</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              Vous aurez accès aux prix, aux fournisseurs et à la commande dès qu'un administrateur approuvera votre compte.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Connectez-vous en tant que propriétaire de café approuvé pour voir les prix, les fournisseurs et passer des commandes.
          </p>
        )}
      </div>
      {!isPending && (
        <Link href="/login">
          <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-2 rounded-xl px-8">
            <LogIn className="w-4 h-4" /> Connexion
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── Filter Badge Row ──────────────────────────────────────────────────────────

function FilterBadges<T extends { id: number; name: string }>({
  label,
  items,
  selected,
  onSelect,
  showLabel = true,
  isDark = false,
  isModal = false,
}: {
  label: string;
  items: T[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  showLabel?: boolean;
  isDark?: boolean;
  isModal?: boolean;
}) {
  if (items.length === 0) return null;

  // ── Modal: Favorites-style horizontal pill switcher ──────────────────────
  if (isModal) {
    const containerCls = isDark ? "bg-gray-800"   : "bg-gray-100";
    const activeCls    = isDark ? "bg-gray-700 text-amber-400 shadow-sm" : "bg-white text-amber-600 shadow-sm";
    const inactiveCls  = isDark ? "text-gray-400 hover:text-gray-200"   : "text-gray-500 hover:text-gray-700";
    return (
      <div
        className={`flex gap-1.5 rounded-2xl p-1.5 overflow-x-auto ${containerCls}`}
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <button
          onClick={() => onSelect(null)}
          className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded-xl transition-all ${selected === null ? activeCls : inactiveCls}`}
        >
          Tous
        </button>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(selected === item.id ? null : item.id)}
            className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded-xl transition-all ${selected === item.id ? activeCls : inactiveCls}`}
          >
            {item.name}
          </button>
        ))}
      </div>
    );
  }

  // ── Page: original rounded-full outline pills ────────────────────────────
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLabel && <span className="text-xs font-semibold text-muted-foreground shrink-0">{label}:</span>}
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          selected === null ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
        }`}
      >
        Tous
      </button>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(selected === item.id ? null : item.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            selected === item.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}

// ── Shared Product Details Content ────────────────────────────────────────────

export function ProductDetailContent({
  productId,
  supplierId,
  onBack,
  backLabel = "Retour au catalogue",
  isModal = false,
  // Optional — forwarded as-is onto the modal's own scrollable body div so a
  // parent Dialog wrapper (product-quick-view-modal.tsx) can drive the same
  // scroll-direction dismissal gesture as the Pack Detail Modal (see
  // client/src/hooks/use-scroll-dismiss.ts) without this shared component
  // needing to know anything about dismissal itself. Unused/ignored in
  // full-page mode (isModal=false), where there is no such scroll container.
  onBodyWheel,
  onBodyTouchStart,
  onBodyTouchMove,
  onBodyTouchEnd,
  // Optional — Previous/Next Product navigation (task: "Navigate Between
  // Mapped Products and Packs Without Closing the Detail Modal"). The
  // parent Dialog wrapper owns the Shop's navIds list and the navigateTo
  // store action; this component only renders the buttons and calls the
  // provided callbacks. Unused in full-page mode, where no caller passes
  // these — product-detail-page.tsx never does.
  hasProductNav = false,
  canNavPrev = false,
  canNavNext = false,
  onNavPrev,
  onNavNext,
}: {
  productId: string;
  supplierId?: number;
  onBack: () => void;
  backLabel?: string;
  isModal?: boolean;
  onBodyWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
  onBodyTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onBodyTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onBodyTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void;
  hasProductNav?: boolean;
  canNavPrev?: boolean;
  canNavNext?: boolean;
  onNavPrev?: () => void;
  onNavNext?: () => void;
}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { items } = useCart();
  const { isVisitor, isPending, hasCommercial } = useAccess(user);
  const fmt = useFormatCurrency();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | null>(null);
  const [selectedSizeId,   setSelectedSizeId]   = useState<number | null>(null);
  const [locationFilter, setLocationFilter] = useState<{
    lat: number; lng: number; radius: number | null; label: string;
  } | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [reviewModalOpen,   setReviewModalOpen]   = useState(false);
  const [activeImageIdx,    setActiveImageIdx]    = useState(0);
  const [supplierSort,      setSupplierSort]      = useState<"nearest" | "cheapest" | null>(null);

  // ── Modal-only: dark theme ────────────────────────────────────────────────
  const { isDark, toggle: toggleTheme } = useThemeStore();

  // ── Zoom via ref ──────────────────────────────────────────────────────────
  const mainImgRef = useRef<HTMLImageElement>(null);
  const handleImageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (mainImgRef.current) mainImgRef.current.style.transformOrigin = `${x}% ${y}%`;
  }, []);

  // ── Product data ──────────────────────────────────────────────────────────
  const { data: product, isLoading, error } = useQuery<MarketplaceProduct>({
    queryKey: ["/api/marketplace", productId, supplierId ?? null],
    queryFn: async () => {
      const supplierQuery = supplierId != null ? `?supplierId=${supplierId}` : "";
      const res = await fetch(`/api/marketplace/${productId}${supplierQuery}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!productId,
  });

  // ── Favorite (Shop) — mirrors browse-products.tsx's exact toggleShop
  // shape/pattern; reuses the one existing product-favorite slot instead of
  // introducing a second favorite system for this modal's image overlay.
  const favedProduct = useFavorites((s) => (product ? !!s.shop[product.id] : false));

  // ── Avis (Review) — data-fetching/mutation moved here from the now-shared
  // ReviewModal component (task: "Use One Shared Avis Modal for Products and
  // Packs"). ReviewModal itself is presentation-only; this is the
  // product-specific adapter that supplies its props, exactly mirroring the
  // pack-specific adapter in pack-quick-view-modal.tsx's PackReviewsModal.
  const queryClient = useQueryClient();
  const { data: existingProductReviews = [] } = useQuery<any[]>({
    queryKey: ["/api/reviews/product", product?.id, "list"],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/product/${product!.id}/list`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: reviewModalOpen && !!product,
  });
  const { data: myProductReview } = useQuery<any>({
    queryKey: ["/api/reviews/my/product", product?.id],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/my/product/${product!.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: reviewModalOpen && !!product && !!user,
  });
  const submitProductReview = useMutation({
    mutationFn: async ({ rating, comment }: { rating: number; comment: string }) => {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product!.id,
          rating,
          comment: comment.trim() || null,
          productName: product!.name,
          reviewType: "PRODUCT",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/product", String(product!.id)] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/product", product!.id, "list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/my/product", product!.id] });
      invalidateMarketplace(queryClient, product!.id);
    },
  });
  const toggleShopFav = useFavorites((s) => s.toggleShop);

  // Clear item-specific selection state when switching to a different
  // product via Previous/Next (task: "Navigate Between Mapped Products and
  // Packs Without Closing the Detail Modal") — the modal no longer
  // unmounts/remounts on navigation, so this state would otherwise carry
  // over from the previous product. Only the flavor/size filters and an
  // open review form are cleared; location filter and supplier sort are
  // closer to a standing Shop-wide preference, left untouched. This only
  // ever fires when the product actually changes (including the very first
  // load), never on every re-render.
  useEffect(() => {
    setSelectedFlavorId(null);
    setSelectedSizeId(null);
    setReviewModalOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // ── Review stats ──────────────────────────────────────────────────────────
  const { data: reviewData } = useQuery<{
    product: { avgRating: number; total: number };
    overall: { avgRating: number; total: number };
    bySupplier: Record<string, { avgRating: number; total: number }>;
  }>({
    queryKey: ["/api/reviews/product", productId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/product/${productId}`);
      if (!res.ok) return { product: { avgRating: 0, total: 0 }, overall: { avgRating: 0, total: 0 }, bySupplier: {} };
      return res.json();
    },
    enabled: !!productId && hasCommercial,
  });

  // ── Store-scoped listings ─────────────────────────────────────────────────
  // When supplierId is set (Store context), every listing-dependent computation
  // must be restricted to that single supplier's listing only. The backend
  // already filters via ?supplierId=X, but this client-side guard prevents any
  // stale-cache or race-condition scenario from leaking other suppliers' data.
  const storeListings = useMemo(
    () => supplierId != null
      ? (product?.listings ?? []).filter(l => l.supplierId === supplierId)
      : (product?.listings ?? []),
    [product, supplierId],
  );

  // ── Promotions for all listings of this product ───────────────────────────
  const allListingIds = useMemo(
    // Use storeListings so that in a Store context the promotions fetch is
    // scoped to the store supplier's listing only.
    () => storeListings.map(l => l.id),
    [storeListings],
  );
  const { data: listingPromotions = [] } = useQuery<ListingPromotion[]>({
    queryKey: ["/api/marketplace/promotions", allListingIds.slice().sort().join(",")],
    queryFn: async () => {
      if (!allListingIds.length) return [];
      const res = await fetch(
        `/api/marketplace/promotions?listingIds=${allListingIds.join(",")}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: allListingIds.length > 0 && hasCommercial,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // ── Best promotional price for the header (store context only) ───────────────
  const headerBestPromoPrice = useMemo(() => {
    if (supplierId == null || !product) return null;
    // Scope promotions to the store supplier's listings only
    const storeListingIdSet = new Set(storeListings.map(l => l.id));
    const eligible = listingPromotions.filter(
      p => storeListingIdSet.has(p.listingId) && VARIANT_PRICE_TYPES.has(p.type),
    );
    if (!eligible.length) return null;
    const pct = eligible.filter(p => ['PERCENTAGE', 'CATEGORY_DISCOUNT', 'MIN_QUANTITY', 'FIRST_ORDER'].includes(p.type));
    const best = pct.length
      ? pct.reduce((b, p) => p.discountValue > b.discountValue ? p : b, pct[0])
      : eligible.reduce((b, p) => p.discountValue > b.discountValue ? p : b, eligible[0]);
    const promoPrice = calcPromoPrice(product.bestPrice, best);
    // Only return the promo price when it is strictly less than the base price
    return promoPrice != null && promoPrice < product.bestPrice ? promoPrice : null;
  }, [supplierId, product, listingPromotions, storeListings]);

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  // ── Images ────────────────────────────────────────────────────────────────
  const allImages = useMemo(() => {
    if (!product) return [];
    return [product.imageUrl, ...((product as any).imageUrls ?? [])].filter(Boolean) as string[];
  }, [product]);

  const safeActiveIdx = Math.min(activeImageIdx, Math.max(0, allImages.length - 1));
  const activeImageAdjustPct = getAdjustmentFor((product as any)?.imageAdjustments, allImages[safeActiveIdx]);
  const { wrapperStyle: mainImageCropStyle } = useCoverZoomStyle(activeImageAdjustPct);

  // ── Flavors / Sizes ───────────────────────────────────────────────────────
  const { allFlavors, allSizes } = useMemo(() => {
    const fMap = new Map<number, string>();
    const sMap = new Map<number, string>();
    for (const l of storeListings) {
      for (const v of l.variants) {
        if (v.flavorId && v.flavorName) fMap.set(v.flavorId, v.flavorName);
        if (v.sizeId   && v.sizeName)   sMap.set(v.sizeId,   v.sizeName);
      }
    }
    return {
      allFlavors: Array.from(fMap.entries()).map(([id, name]) => ({ id, name })),
      allSizes:   Array.from(sMap.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [storeListings]);

  const availableFlavors = useMemo(() => {
    if (selectedSizeId === null) return allFlavors;
    const validIds = new Set<number>();
    for (const l of storeListings)
      for (const v of l.variants)
        if (v.sizeId === selectedSizeId && v.flavorId) validIds.add(v.flavorId);
    return allFlavors.filter(f => validIds.has(f.id));
  }, [storeListings, allFlavors, selectedSizeId]);

  const availableSizes = useMemo(() => {
    if (selectedFlavorId === null) return allSizes;
    const validIds = new Set<number>();
    for (const l of storeListings)
      for (const v of l.variants)
        if (v.flavorId === selectedFlavorId && v.sizeId) validIds.add(v.sizeId);
    return allSizes.filter(s => validIds.has(s.id));
  }, [storeListings, allSizes, selectedFlavorId]);

  const handleFlavorSelect = useCallback((id: number | null) => {
    setSelectedFlavorId(id);
    if (id !== null && selectedSizeId !== null) {
      const valid = new Set<number>();
      for (const l of storeListings)
        for (const v of l.variants)
          if (v.flavorId === id && v.sizeId) valid.add(v.sizeId);
      if (!valid.has(selectedSizeId)) setSelectedSizeId(null);
    }
  }, [selectedSizeId, storeListings]);

  const handleSizeSelect = useCallback((id: number | null) => {
    setSelectedSizeId(id);
    if (id !== null && selectedFlavorId !== null) {
      const valid = new Set<number>();
      for (const l of storeListings)
        for (const v of l.variants)
          if (v.sizeId === id && v.flavorId) valid.add(v.flavorId);
      if (!valid.has(selectedFlavorId)) setSelectedFlavorId(null);
    }
  }, [selectedFlavorId, storeListings]);

  const refLocation = useMemo(() => {
    if (locationFilter) return { lat: locationFilter.lat, lng: locationFilter.lng };
    if (user?.locationLat && user?.locationLng)
      return { lat: parseFloat(user.locationLat), lng: parseFloat(user.locationLng) };
    return null;
  }, [locationFilter, user?.locationLat, user?.locationLng]);

  const filteredListings = useMemo(() => {
    if (!storeListings.length) return [];
    return storeListings
      .map((listing) => {
        const variants = listing.variants.filter((v) => {
          if (selectedFlavorId !== null && v.flavorId !== selectedFlavorId) return false;
          if (selectedSizeId   !== null && v.sizeId   !== selectedSizeId)   return false;
          return true;
        });
        return { listing, variants };
      })
      .filter(({ listing, variants }) => {
        if (variants.length === 0) return false;
        if (variants.every((v) => v.quantity <= 0)) return false;
        if (locationFilter) {
          if (!listing.supplierLat || !listing.supplierLng) return false;
          const dist = haversineKm(
            locationFilter.lat, locationFilter.lng,
            parseFloat(listing.supplierLat), parseFloat(listing.supplierLng),
          );
          if (locationFilter.radius !== null && dist > locationFilter.radius) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (supplierSort === "cheapest") return a.listing.minPrice - b.listing.minPrice;
        if (supplierSort === "nearest" || locationFilter) {
          if (!refLocation) return 0;
          const dA = a.listing.supplierLat && a.listing.supplierLng
            ? haversineKm(refLocation.lat, refLocation.lng, parseFloat(a.listing.supplierLat), parseFloat(a.listing.supplierLng))
            : Infinity;
          const dB = b.listing.supplierLat && b.listing.supplierLng
            ? haversineKm(refLocation.lat, refLocation.lng, parseFloat(b.listing.supplierLat), parseFloat(b.listing.supplierLng))
            : Infinity;
          return dA - dB;
        }
        return 0;
      });
  }, [storeListings, selectedFlavorId, selectedSizeId, locationFilter, supplierSort, refLocation]);

  const handleLocationConfirm = (loc: PickedLocation) => {
    setLocationFilter({
      lat: parseFloat(loc.lat), lng: parseFloat(loc.lng),
      radius: loc.radius ?? null,
      label: loc.address.split(",")[0]?.trim() ?? loc.address,
    });
    setLocationModalOpen(false);
  };

  // ── Modal theme tokens ────────────────────────────────────────────────────
  const dk           = isModal && isDark;
  const bg           = isModal ? (dk ? "bg-gray-900" : "bg-white") : "";
  const textPrimary  = dk ? "text-white"   : "text-gray-900";
  const textMuted    = dk ? "text-gray-400" : "text-gray-500";

  // toolbar buttons (nearest / cheapest / write review)
  const tbActive   = dk
    ? "bg-gray-700 text-white border-gray-600"
    : "bg-primary text-primary-foreground border-primary";
  const tbInactive = dk
    ? "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground";
  const tbOutline  = dk
    ? "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
    : "";

  const locPillCls = dk
    ? "bg-gray-800 border-gray-700 text-amber-400"
    : "bg-amber-50 border-amber-200 text-amber-800";
  const locXCls    = dk ? "hover:text-red-400" : "hover:text-red-500";

  const isCafeOwner = !!product && user?.role === "CAFE_OWNER" && user?.status === "approved";

  // Shared modal-mode overlay (Theme + Close only — no Fav/Avis, since
  // there's no product yet to act on) for the loading/error skeletons below.
  // Reuses the exact same image-area shell as the real success-state
  // content (full-width box, same rounded-t-[2rem], same overlay button
  // classes/position) instead of the old separate ModalHeader bar, so that
  // switching between loading/error/success for different products — e.g.
  // navigating via Previous/Next Product to an item not yet fetched — never
  // swaps to a structurally different layout. That exact mismatch was the
  // confirmed root cause of the brief "second modal" flicker during
  // navigation (task: "Fix Product Navigation Flicker and Add Filter-Aware
  // Navigation to Store Detail Modals") — the component stays mounted
  // throughout navigation, so a jarring shell swap was fully visible with
  // no opening animation to mask it.
  const ModalImageAreaOverlay = () => (
    <div className="absolute top-3 right-3 z-20 flex gap-2">
      <button
        onClick={toggleTheme}
        aria-label="Changer de thème"
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-black/40 backdrop-blur-sm"
      >
        {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-white" />}
      </button>
      <button
        onClick={onBack}
        aria-label="Fermer"
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-black/40 backdrop-blur-sm"
      >
        <X className="w-4 h-4 text-white" />
      </button>
    </div>
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    const skeleton = (
      <div className={isModal ? "px-3 sm:px-5 py-6 space-y-6" : "p-6 max-w-4xl mx-auto space-y-6"}>
        <Skeleton className="h-8 w-40 rounded-lg" />
        <div className="flex gap-6">
          <Skeleton className="w-64 h-64 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
    if (!isModal) return skeleton;
    return (
      <div className={`flex-1 min-h-0 flex flex-col ${bg}`}>
        <div className="flex-1 min-h-0 overflow-y-auto pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          <div className={`relative w-full h-80 sm:h-[420px] shrink-0 rounded-t-[2rem] animate-pulse ${dk ? "bg-gray-800" : "bg-gray-50"}`}>
            <ModalImageAreaOverlay />
          </div>
          <div className="px-3 sm:px-5 pt-5 pb-4 space-y-3">
            <Skeleton className={`h-7 w-2/3 rounded-lg ${dk ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-4 w-full rounded-lg ${dk ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-4 w-1/2 rounded-lg ${dk ? "bg-gray-800" : ""}`} />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !product) {
    const errContent = (
      <div className={isModal ? "p-6 text-center py-24" : "p-6 text-center py-32"}>
        <Package className="w-14 h-14 mx-auto text-muted-foreground opacity-30 mb-4" />
        <p className={`font-semibold text-lg ${isModal ? textPrimary : ""}`}>Produit introuvable</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>{isModal ? "Fermer" : backLabel}</Button>
      </div>
    );
    if (!isModal) return errContent;
    return (
      <div className={`flex-1 min-h-0 flex flex-col ${bg}`}>
        <div className="flex-1 min-h-0 overflow-y-auto pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className={`relative w-full h-80 sm:h-[420px] shrink-0 rounded-t-[2rem] ${dk ? "bg-gray-800" : "bg-gray-50"}`}>
            <ModalImageAreaOverlay />
          </div>
          {errContent}
        </div>
      </div>
    );
  }

  // ── Product image gallery ─────────────────────────────────────────────────
  const imageGallery = (
    <div className="shrink-0 flex flex-col gap-2">
      <div
        className={`w-full sm:w-56 h-56 rounded-2xl overflow-hidden cursor-zoom-in group ${
          isModal ? (dk ? "bg-gray-800" : "bg-gray-100") : "bg-secondary/30"
        }`}
        onMouseMove={handleImageMouseMove}
      >
        {allImages.length > 0 ? (
          <div style={mainImageCropStyle}>
            <img
              ref={mainImgRef}
              src={allImages[safeActiveIdx]}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[2]"
              style={{ transformOrigin: "50% 50%" }}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`w-16 h-16 opacity-20 ${isModal ? (dk ? "text-gray-600" : "text-gray-300") : "text-muted-foreground"}`} />
          </div>
        )}
      </div>
      {allImages.length > 1 && (
        <div className="flex flex-row gap-2 overflow-x-auto sm:w-56 pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400/40">
          {allImages.map((url, idx) => (
            <button
              key={idx}
              onClick={() => setActiveImageIdx(idx)}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors shrink-0 ${
                idx === safeActiveIdx
                  ? isModal ? (dk ? "border-amber-500" : "border-amber-400") : "border-primary"
                  : isModal ? (dk ? "border-gray-700 hover:border-gray-500" : "border-gray-200 hover:border-gray-400") : "border-border hover:border-primary/50"
              }`}
            >
              <div style={{ width: "100%", height: "100%", transform: `scale(${computeCoverZoomScale(getAdjustmentFor((product as any)?.imageAdjustments, url))})`, transformOrigin: "center" }}>
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Product text info ─────────────────────────────────────────────────────
  // Category badges and title are split into their own blocks so the modal
  // can reorder them (title + nav row first, badges second) while the
  // full-page layout keeps its original order (badges, then title) — task:
  // "Fix Pack and Product Detail Modal Header Layout".
  const categoryBadges = (
    <div className="flex flex-wrap gap-2">
      {product.category && (
        <Badge variant="secondary" className={isModal && dk ? "bg-gray-700 text-gray-200 border-gray-600" : ""}>
          {product.category}
        </Badge>
      )}
      {product.subCategoryLabel && (
        <Badge variant="outline" className={isModal && dk ? "border-gray-600 text-gray-300" : ""}>
          {product.subCategoryLabel.name}
        </Badge>
      )}
      {product.brandLabel && (
        <Badge className={`text-xs ${isModal && dk ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
          {product.brandLabel.name}
        </Badge>
      )}
    </div>
  );

  // Previous/Next Product navigation — same conceptual position as the Pack
  // Detail Modal's own pair (same row as the title, fixed to the right,
  // never displaced by a long title). Image Previous/Next (inside the
  // carousel above) is a fully separate control with its own handler — this
  // never touches the image index, and image navigation never touches these.
  const productNavButtons = hasProductNav && (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onNavPrev}
        disabled={!canNavPrev}
        aria-label="Produit précédent"
        title="Produit précédent"
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
        data-testid="button-product-nav-prev"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onNavNext}
        disabled={!canNavNext}
        aria-label="Produit suivant"
        title="Produit suivant"
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
        data-testid="button-product-nav-next"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  // Title row: in modal mode, shares its row with the nav buttons (fixed
  // right, never wrapped onto a second line by a long title — min-w-0 on
  // the title lets it shrink and wrap within its own space instead).
  // Outside modal mode (full page), it's just the plain title, unchanged.
  const titleRow = isModal ? (
    <div className="flex items-start justify-between gap-x-3">
      <h1 className={`text-2xl font-bold min-w-0 ${textPrimary}`}>{product.name}</h1>
      {productNavButtons}
    </div>
  ) : (
    <h1 className="text-2xl font-bold">{product.name}</h1>
  );

  const productInfo = (
    <div className="flex-1 space-y-3">
      {isModal ? (
        <>
          {titleRow}
          {categoryBadges}
        </>
      ) : (
        <>
          {categoryBadges}
          {titleRow}
        </>
      )}

      {product.description && (
        <p className={`leading-relaxed ${isModal ? textMuted : "text-muted-foreground"}`}>{product.description}</p>
      )}

      {/* Product review summary */}
      {hasCommercial && reviewData && reviewData.product.total > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Stars rating={reviewData.product.avgRating} />
          <span className={`text-sm font-medium ${isModal ? textPrimary : ""}`}>{reviewData.product.avgRating.toFixed(1)}</span>
          <span className={`text-xs ${isModal ? textMuted : "text-muted-foreground"}`}>
            ({reviewData.product.total} avis sur le produit)
          </span>
        </div>
      )}

      {/* Price + supplier count */}
      {hasCommercial ? (
        <div className="flex items-center gap-4 pt-2">
          {supplierId != null ? (
            /* Store context: no "Starting from", show promo price if applicable */
            <div className="flex items-center gap-2">
              <p className={`text-2xl font-bold ${isModal ? (dk ? "text-blue-400" : "text-blue-600") : "text-primary"}`}>
                {headerBestPromoPrice != null ? fmt(headerBestPromoPrice) : product.bestPrice != null ? fmt(product.bestPrice) : "—"}
              </p>
              {headerBestPromoPrice != null && (
                <p className={`text-base line-through ${isModal ? textMuted : "text-muted-foreground"}`}>
                  {product.bestPrice != null ? fmt(product.bestPrice) : ""}
                </p>
              )}
            </div>
          ) : (
            /* Marketplace context: "Starting from" + supplier count */
            <>
              <div>
                <p className={`text-xs ${isModal ? textMuted : "text-muted-foreground"}`}>À partir de</p>
                <p className={`text-2xl font-bold ${isModal ? (dk ? "text-blue-400" : "text-blue-600") : "text-primary"}`}>
                  {product.bestPrice != null ? fmt(product.bestPrice) : "—"}
                </p>
              </div>
              <>
                <div className={`h-8 border-l ${isModal ? (dk ? "border-gray-700" : "border-gray-200") : "border-border"}`} />
                <div>
                  <p className={`text-xs ${isModal ? textMuted : "text-muted-foreground"}`}>Fournisseurs</p>
                  <p className={`font-bold text-lg ${isModal ? textPrimary : ""}`}>
                    {filteredListings.length}
                    <span className={`text-xs font-normal ml-1 ${isModal ? textMuted : "text-muted-foreground"}`}>
                      /{product.supplierCount} visibles
                    </span>
                  </p>
                </div>
              </>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/30 rounded-xl px-4 py-3">
          <Lock className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" />
          <span>Prix disponible pour les propriétaires de café approuvés</span>
        </div>
      )}

      {/* Flavor / size badges — page mode only (modal renders them separately below) */}
      {!isModal && hasCommercial && allFlavors.length > 0 && (
        <FilterBadges label="Flavors" items={availableFlavors} selected={selectedFlavorId} onSelect={handleFlavorSelect} showLabel={false} />
      )}
      {!isModal && hasCommercial && allSizes.length > 0 && (
        <FilterBadges label="Sizes" items={availableSizes} selected={selectedSizeId} onSelect={handleSizeSelect} showLabel={false} />
      )}
    </div>
  );

  // ── Flavor / size switchers (modal: Favorites-style, placed below product info) ─
  const modalFilterSwitchers = isModal && hasCommercial && (allFlavors.length > 0 || allSizes.length > 0) && (
    <div className="space-y-2">
      {allFlavors.length > 0 && (
        <FilterBadges label="Flavors" items={availableFlavors} selected={selectedFlavorId} onSelect={handleFlavorSelect} showLabel={false} isDark={isDark} isModal />
      )}
      {allSizes.length > 0 && (
        <FilterBadges label="Sizes" items={availableSizes} selected={selectedSizeId} onSelect={handleSizeSelect} showLabel={false} isDark={isDark} isModal />
      )}
    </div>
  );

  // ── Supplier toolbar ──────────────────────────────────────────────────────
  const supplierToolbar = (
    <div className="flex items-center justify-between flex-wrap gap-2">
      
      <div className="flex items-center gap-2 flex-wrap">
        {/* Location filter */}
        {supplierId == null && locationFilter ? (
          <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 text-xs font-medium ${locPillCls}`}>
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{locationFilter.label}</span>
            {locationFilter.radius !== null && <span className="opacity-70">· {locationFilter.radius} km</span>}
            <button type="button" onClick={() => setLocationFilter(null)} className={`ml-1 transition-colors ${locXCls}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : supplierId == null ? (
          <Button variant="outline" size="sm" className={`gap-1.5 text-xs ${tbOutline}`} onClick={() => setLocationModalOpen(true)}>
            <MapPin className="w-3.5 h-3.5" /> Maps
          </Button>
        ) : null}
        {/* Nearest */}
        {supplierId == null && refLocation && (
          <button
            type="button"
            onClick={() => setSupplierSort(supplierSort === "nearest" ? null : "nearest")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${supplierSort === "nearest" ? tbActive : tbInactive}`}
          >
            <Navigation className="w-3 h-3" /> Plus proche
          </button>
        )}
        {/* Cheapest */}
        {supplierId == null && <button
          type="button"
          onClick={() => setSupplierSort(supplierSort === "cheapest" ? null : "cheapest")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${supplierSort === "cheapest" ? tbActive : tbInactive}`}
        >
          <Tag className="w-3 h-3" /> Moins cher
        </button>}
        
      </div>
    </div>
  );

  // ── Supplier listings ─────────────────────────────────────────────────────
  const supplierListings = hasCommercial ? (
    <div className="space-y-3">
      {supplierToolbar}
      {filteredListings.length === 0 ? (
        <div className={
          isModal
            ? `rounded-2xl border p-12 text-center ${dk ? "border-gray-700/60 text-gray-400" : "border-gray-100 text-gray-500"}`
            : "rounded-2xl border border-border/50 p-12 text-center text-muted-foreground"
        }>
          {storeListings.length === 0
            ? "Aucune offre fournisseur disponible pour ce produit."
            : "Aucun fournisseur ne correspond aux filtres actuels. Essayez d'ajuster vos filtres de parfum, taille ou localisation."}
        </div>
      ) : (
        filteredListings.map(({ listing, variants }) => {
          const distanceKm = refLocation && listing.supplierLat && listing.supplierLng
            ? haversineKm(refLocation.lat, refLocation.lng, parseFloat(listing.supplierLat), parseFloat(listing.supplierLng))
            : undefined;
          return (
            <SupplierSection
              key={listing.id}
              listing={listing}
              product={product}
              visibleVariants={variants}
              reviewStats={reviewData?.bySupplier[String(listing.supplierId)]}
              distanceKm={distanceKm}
              promotions={listingPromotions.filter(p => p.listingId === listing.id)}
              isDark={isModal && isDark}
            />
          );
        })
      )}
    </div>
  ) : (
    <CommercialGate isPending={isPending} />
  );

  // ── Modals (LocationPicker + ReviewModal) ─────────────────────────────────
  const auxModals = (
    <>
      <LocationPickerModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onConfirm={handleLocationConfirm}
        title="Où voulez-vous rechercher ?"
        mode="search"
        showRadius
      />
      <ReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        targetName={product.name}
        reviewTypeLabel="Avis sur le produit"
        existingReviews={existingProductReviews}
        myReview={myProductReview ?? null}
        onSubmit={(rating, comment) => submitProductReview.mutateAsync({ rating, comment })}
        isSubmitting={submitProductReview.isPending}
      />
    </>
  );

  // ── Modal layout ──────────────────────────────────────────────────────────
  if (isModal) {
    const stickyBg      = dk ? "bg-gray-900"  : "bg-white";
    const stickyBorder  = dk ? "border-gray-800" : "border-gray-100";
    const hasFilters    = hasCommercial && (allFlavors.length > 0 || allSizes.length > 0);

    return (
      <div className={`flex-1 min-h-0 flex flex-col ${bg}`}>

        {/* Scrollable body — hero image flush with the modal's own top
            corners, overlay controls on the image itself (Fav/Theme/Close
            top-right, Avis bottom-right, Previous/Next + counter via
            PackImageGallery's carousel mode) instead of a separate header
            bar, matching the Pack Detail Modal's image section exactly
            (task: "Product Detail Modal: Match the Pack Detail Image
            Section"). */}
        <div
          className="flex-1 min-h-0 overflow-y-auto pb-8 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full"
          onWheel={onBodyWheel}
          onTouchStart={onBodyTouchStart}
          onTouchMove={onBodyTouchMove}
          onTouchEnd={onBodyTouchEnd}
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          <div>
            <PackImageGallery
              images={allImages}
              alt={product.name}
              mainClassName={`relative w-full h-80 sm:h-[420px] shrink-0 ${dk ? "bg-gray-800" : "bg-gray-50"}`}
              mainRoundedClassName="rounded-t-[2rem]"
              emptyClassName={dk ? "text-gray-700" : "text-gray-300"}
              getImageStyle={(url) => {
                const scale = computeCoverZoomScale(getAdjustmentFor((product as any)?.imageAdjustments, url));
                return { width: "100%", height: "100%", transform: `scale(${scale})`, transformOrigin: "center", transition: "transform 150ms ease-out" };
              }}
              carousel
              overlay={
                <>
                  <ModalGrabber isDark={dk} onImage />
                  <div className="absolute top-3 right-3 z-20 flex gap-2">
                    <button
                      onClick={() => toggleShopFav({
                        id: product.id,
                        name: product.name,
                        supplier: product.category ?? "",
                        price: product.bestPrice ?? 0,
                        image: product.imageUrl ?? "",
                      })}
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 bg-black/40 backdrop-blur-sm"
                      data-testid="button-fav-product-modal"
                    >
                      <Heart className={`w-4 h-4 transition-colors ${favedProduct ? "fill-rose-500 text-rose-500" : "text-white"}`} />
                    </button>
                    <button
                      onClick={toggleTheme}
                      aria-label="Changer de thème"
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-black/40 backdrop-blur-sm"
                    >
                      {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-white" />}
                    </button>
                    <button
                      onClick={onBack}
                      aria-label="Fermer"
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors bg-black/40 backdrop-blur-sm"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  {isCafeOwner && (
                    <div className="absolute bottom-3 right-3 z-20">
                      <button
                        onClick={() => setReviewModalOpen(true)}
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 bg-black/40 backdrop-blur-sm"
                        data-testid="button-open-product-reviews"
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

          {/* ── Product info — full width below the image, matching the
              Pack Detail Modal's stacked layout (not side-by-side) ── */}
          <div className="px-3 sm:px-5 pt-5 pb-4">
            {productInfo}
          </div>

          {/* ── Sticky filters block ── */}
          {hasCommercial && (
            <div
              className={`sticky top-0 z-10 ${stickyBg} border-b ${stickyBorder} px-3 sm:px-5 pt-3 pb-3 space-y-3`}
            >
              {/* Flavor / size switchers */}
              {hasFilters && (
                <div className="space-y-2">
                  {allFlavors.length > 0 && (
                    <FilterBadges label="Flavors" items={availableFlavors} selected={selectedFlavorId} onSelect={handleFlavorSelect} showLabel={false} isDark={isDark} isModal />
                  )}
                  {allSizes.length > 0 && (
                    <FilterBadges label="Sizes" items={availableSizes} selected={selectedSizeId} onSelect={handleSizeSelect} showLabel={false} isDark={isDark} isModal />
                  )}
                </div>
              )}
              {/* Supplier toolbar */}
              {supplierToolbar}
            </div>
          )}

          {/* ── Supplier cards (scroll underneath sticky) ── */}
          <div className="px-3 sm:px-5 pt-3 pb-5">
            {hasCommercial ? (
              <div className="space-y-3">
                {filteredListings.length === 0 ? (
                  <div className={`rounded-2xl border p-12 text-center ${dk ? "border-gray-700/60 text-gray-400" : "border-gray-100 text-gray-500"}`}>
                    {storeListings.length === 0
                      ? "Aucune offre fournisseur disponible pour ce produit."
                      : "Aucun fournisseur ne correspond aux filtres actuels. Essayez d'ajuster vos filtres de parfum, taille ou localisation."}
                  </div>
                ) : (
                  filteredListings.map(({ listing, variants }) => {
                    const distanceKm = refLocation && listing.supplierLat && listing.supplierLng
                      ? haversineKm(refLocation.lat, refLocation.lng, parseFloat(listing.supplierLat), parseFloat(listing.supplierLng))
                      : undefined;
                    return (
                      <SupplierSection
                        key={listing.id}
                        listing={listing}
                        product={product}
                        visibleVariants={variants}
                        reviewStats={reviewData?.bySupplier[String(listing.supplierId)]}
                        distanceKm={distanceKm}
                        promotions={listingPromotions.filter(p => p.listingId === listing.id)}
                        isDark={isModal && isDark}
                      />
                    );
                  })
                )}
              </div>
            ) : (
              <CommercialGate isPending={isPending} />
            )}
          </div>
        </div>

        {/* auxModals (LocationPickerModal + ReviewModal) rendered OUTSIDE the
            scrollable gesture div above, not as its descendant — otherwise a
            touch gesture starting inside one of these nested Dialogs (e.g. a
            swipe meant to scroll/dismiss the Review Modal) bubbles up through
            React's synthetic event tree into this component's own
            onBodyTouchMove/onBodyTouchEnd (passed down from
            product-quick-view-modal.tsx's useScrollDismiss) and can dismiss
            THIS modal while the nested one stays open underneath — the exact
            bug this fixes. Matches the Pack Detail Modal's own nested-modal
            placement (pack-quick-view-modal.tsx renders PackReviewsModal/
            ProductPreviewModal as siblings of its own gesture-bound
            DialogContent, never inside it). */}
        {auxModals}
      </div>
    );
  }

  // ── Full-page layout (unchanged behavior) ─────────────────────────────────
  return (
    <div className="p-6 w-full max-w-4xl mx-auto space-y-6">
      {/* Back + Cart */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-back-browse"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </button>
        {hasCommercial && cartCount > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/cart")} data-testid="button-view-cart">
            <ShoppingCart className="w-4 h-4" /> {cartCount} article{cartCount !== 1 ? "s" : ""} dans le panier
          </Button>
        )}
      </div>

      {/* Product header */}
      <div className="flex flex-col sm:flex-row gap-6">
        {imageGallery}
        {productInfo}
      </div>

      {/* Supplier section */}
      {supplierListings}

      {auxModals}
    </div>
  );
}
