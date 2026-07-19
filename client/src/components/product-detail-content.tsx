import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Package, Store, Minus, Plus, ShoppingCart, CheckCircle2,
  Lock, AlertTriangle, LogIn, MapPin, Star, MessageSquarePlus, X, Navigation, Tag, Sun, Moon,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceProduct, MarketplaceListing, MarketplaceVariant } from "@shared/schema";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { ReviewModal } from "@/components/review-modal";

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
  variant, listing, product, isDark = false,
}: {
  variant: MarketplaceVariant;
  listing: MarketplaceListing;
  product: MarketplaceProduct;
  isDark?: boolean;
}) {
  const { addItem, getItemQuantity } = useCart();
  const { toast } = useToast();
  const [qty, setQty] = useState(1);
  const inCart = getItemQuantity(listing.id, variant.flavorId, variant.sizeId);
  const outOfStock = variant.quantity <= 0;

  const handleAdd = () => {
    if (outOfStock) return;
    addItem({
      listingId: listing.id, flavorId: variant.flavorId, sizeId: variant.sizeId,
      productId: product.id, productName: product.name, productImageUrl: product.imageUrl ?? null,
      productCategory: product.category ?? "", supplierId: listing.supplierId,
      supplierName: listing.supplierName, flavorName: variant.flavorName ?? null,
      sizeName: variant.sizeName ?? null, unitPrice: variant.price,
    }, qty);
    toast({ title: "Added to cart", description: `${product.name}${variant.flavorName ? ` – ${variant.flavorName}` : ""}${variant.sizeName ? ` (${variant.sizeName})` : ""} × ${qty}` });
  };

  const baseLabel = [variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "Default";
  const label = outOfStock ? baseLabel : `${baseLabel} · ${variant.quantity} in stock`;

  const borderCls   = isDark ? "border-gray-700/40"  : "border-border/40";
  const labelCls    = isDark ? "text-white"           : "";
  const priceCls    = isDark ? "text-blue-400"        : "";
  const stepBorder  = isDark ? "border-gray-700"      : "border-border";
  const stepHover   = isDark ? "hover:bg-gray-700"    : "hover:bg-secondary";
  const stepText    = isDark ? "text-gray-200"        : "";

  return (
    <div className={`py-3 border-b ${borderCls} last:border-0`}>
      {/* Desktop / tablet: single-row layout (sm and up) */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${labelCls}`}>{label}</span>
          {outOfStock && <span className="ml-2 text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md">Out of stock</span>}
        </div>
        <div className={`font-bold text-base shrink-0 ${priceCls}`}>{formatCurrency(variant.price)}</div>
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
              {inCart > 0 ? <><CheckCircle2 className="w-3.5 h-3.5" />{inCart} in cart</> : <><ShoppingCart className="w-3.5 h-3.5" />Add</>}
            </Button>
          </div>
        )}
      </div>

      {/* Mobile: two-line layout */}
      <div className="flex flex-col gap-2 sm:hidden">
        {/* Line 1: label */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-medium ${labelCls}`}>{label}</span>
          {outOfStock && <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md shrink-0">Out of stock</span>}
        </div>
        {/* Line 2: price + qty + add */}
        {!outOfStock && (
          <div className="flex items-center justify-between gap-2">
            <div className={`font-bold text-base ${priceCls}`}>{formatCurrency(variant.price)}</div>
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
                {inCart > 0 ? <><CheckCircle2 className="w-3.5 h-3.5" />{inCart} in cart</> : <><ShoppingCart className="w-3.5 h-3.5" />Add</>}
              </Button>
            </div>
          </div>
        )}
        {outOfStock && (
          <div className={`font-bold text-base ${priceCls}`}>{formatCurrency(variant.price)}</div>
        )}
      </div>
    </div>
  );
}

// ── Supplier Section ──────────────────────────────────────────────────────────

function SupplierSection({
  listing, product, visibleVariants, reviewStats, distanceKm, isDark = false,
}: {
  listing: MarketplaceListing;
  product: MarketplaceProduct;
  visibleVariants: MarketplaceVariant[];
  reviewStats?: { avgRating: number; total: number };
  distanceKm?: number;
  isDark?: boolean;
}) {
  const cardBorder = isDark ? "bg-gray-800 border-gray-700/60" : "border-border/50";
  const headerBg   = isDark ? "bg-gray-800/50"   : "bg-secondary/30";
  const bodyBg     = isDark ? "bg-gray-800"       : "";
  const logoBg     = isDark ? "bg-gray-700"       : "bg-primary/10";
  const logoIcon   = isDark ? "text-gray-400"     : "text-primary";
  const nameCls    = isDark ? "text-white font-semibold" : "font-semibold";
  const subCls     = isDark ? "text-gray-400"     : "text-muted-foreground";

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${cardBorder}`}>
      <div className={`${headerBg} px-5 py-4 flex items-center gap-3`}>
        <div className={`w-9 h-9 rounded-xl overflow-hidden ${logoBg} flex items-center justify-center shrink-0`}>
          {listing.storeLogoUrl
            ? <img src={listing.storeLogoUrl} alt="" className="w-full h-full object-cover" />
            : <Store className={`w-5 h-5 ${logoIcon}`} />
          }
        </div>
        <div>
          <p className={nameCls}>{listing.supplierName}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-xs ${subCls}`}>{visibleVariants.length} variant{visibleVariants.length !== 1 ? "s" : ""}</p>
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
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center space-y-4">
      <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center mx-auto">
        <Lock className="w-7 h-7 text-amber-600" />
      </div>
      <div>
        <h3 className="font-bold text-gray-900 text-lg">Commercial Access Required</h3>
        {isPending ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-center gap-2 text-yellow-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium text-sm">Your account is awaiting approval</span>
            </div>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              You'll have full access to prices, suppliers, and ordering once an admin approves your account.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            Sign in as an approved coffee shop owner to view prices, suppliers and place orders.
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
          All
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
        All
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
  onBack,
  backLabel = "Back to Browse",
  isModal = false,
}: {
  productId: string;
  onBack: () => void;
  backLabel?: string;
  isModal?: boolean;
}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { items } = useCart();
  const { isVisitor, isPending, hasCommercial } = useAccess(user);

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

  // ── Modal-only: dark theme + scroll detection ─────────────────────────────
  const [isDark,   setIsDark]   = useState(true);
  const [scrolled, setScrolled] = useState(false);

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
    queryKey: ["/api/marketplace", productId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/${productId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!productId,
  });

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

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  // ── Images ────────────────────────────────────────────────────────────────
  const allImages = useMemo(() => {
    if (!product) return [];
    return [product.imageUrl, ...((product as any).imageUrls ?? [])].filter(Boolean) as string[];
  }, [product]);

  const safeActiveIdx = Math.min(activeImageIdx, Math.max(0, allImages.length - 1));

  // ── Flavors / Sizes ───────────────────────────────────────────────────────
  const { allFlavors, allSizes } = useMemo(() => {
    if (!product) return { allFlavors: [], allSizes: [] };
    const fMap = new Map<number, string>();
    const sMap = new Map<number, string>();
    for (const l of product.listings) {
      for (const v of l.variants) {
        if (v.flavorId && v.flavorName) fMap.set(v.flavorId, v.flavorName);
        if (v.sizeId   && v.sizeName)   sMap.set(v.sizeId,   v.sizeName);
      }
    }
    return {
      allFlavors: Array.from(fMap.entries()).map(([id, name]) => ({ id, name })),
      allSizes:   Array.from(sMap.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [product]);

  const availableFlavors = useMemo(() => {
    if (!product || selectedSizeId === null) return allFlavors;
    const validIds = new Set<number>();
    for (const l of product.listings)
      for (const v of l.variants)
        if (v.sizeId === selectedSizeId && v.flavorId) validIds.add(v.flavorId);
    return allFlavors.filter(f => validIds.has(f.id));
  }, [product, allFlavors, selectedSizeId]);

  const availableSizes = useMemo(() => {
    if (!product || selectedFlavorId === null) return allSizes;
    const validIds = new Set<number>();
    for (const l of product.listings)
      for (const v of l.variants)
        if (v.flavorId === selectedFlavorId && v.sizeId) validIds.add(v.sizeId);
    return allSizes.filter(s => validIds.has(s.id));
  }, [product, allSizes, selectedFlavorId]);

  const handleFlavorSelect = useCallback((id: number | null) => {
    setSelectedFlavorId(id);
    if (id !== null && selectedSizeId !== null) {
      const valid = new Set<number>();
      for (const l of (product?.listings ?? []))
        for (const v of l.variants)
          if (v.flavorId === id && v.sizeId) valid.add(v.sizeId);
      if (!valid.has(selectedSizeId)) setSelectedSizeId(null);
    }
  }, [selectedSizeId, product]);

  const handleSizeSelect = useCallback((id: number | null) => {
    setSelectedSizeId(id);
    if (id !== null && selectedFlavorId !== null) {
      const valid = new Set<number>();
      for (const l of (product?.listings ?? []))
        for (const v of l.variants)
          if (v.sizeId === id && v.flavorId) valid.add(v.flavorId);
      if (!valid.has(selectedFlavorId)) setSelectedFlavorId(null);
    }
  }, [selectedFlavorId, product]);

  const refLocation = useMemo(() => {
    if (locationFilter) return { lat: locationFilter.lat, lng: locationFilter.lng };
    if (user?.locationLat && user?.locationLng)
      return { lat: parseFloat(user.locationLat), lng: parseFloat(user.locationLng) };
    return null;
  }, [locationFilter, user?.locationLat, user?.locationLng]);

  const filteredListings = useMemo(() => {
    if (!product) return [];
    return product.listings
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
  }, [product, selectedFlavorId, selectedSizeId, locationFilter, supplierSort, refLocation]);

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
  const dividerColor = dk ? "bg-gray-800"  : "bg-gray-100";

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

  // ── Shared modal header (loading + error states reuse this) ───────────────
  const ModalHeader = () => (
    <div className={`shrink-0 ${bg} px-5 pt-5 pb-0`}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          aria-label="Close"
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
        >
          <X className="w-4 h-4" />
        </button>
        {/* Product name + categories fade in when scrolled */}
        <div className={`flex-1 px-2 transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}>
          <p className={`text-[13px] font-semibold truncate text-center ${textPrimary}`}>{product?.name ?? ""}</p>
          {product && (product.category || product.subCategoryLabel || product.brandLabel) && (
            <div className="flex items-center justify-center gap-1 flex-wrap mt-0.5">
              {product.category && (
                <span className={`text-[10px] ${textMuted}`}>{product.category}</span>
              )}
              {product.subCategoryLabel && (
                <><span className={`text-[10px] opacity-40 ${textMuted}`}>·</span><span className={`text-[10px] ${textMuted}`}>{product.subCategoryLabel.name}</span></>
              )}
              {product.brandLabel && (
                <><span className={`text-[10px] opacity-40 ${textMuted}`}>·</span><span className={`text-[10px] ${textMuted}`}>{product.brandLabel.name}</span></>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setIsDark((d) => !d)}
          aria-label="Toggle theme"
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}
        >
          {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
        </button>
      </div>
      <div className={`h-px ${dividerColor}`} />
    </div>
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    const skeleton = (
      <div className={isModal ? "px-5 py-6 space-y-6" : "p-6 max-w-4xl mx-auto space-y-6"}>
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
        <ModalHeader />
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {skeleton}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !product) {
    const errContent = (
      <div className={isModal ? "p-6 text-center py-24" : "p-6 text-center py-32"}>
        <Package className="w-14 h-14 mx-auto text-muted-foreground opacity-30 mb-4" />
        <p className={`font-semibold text-lg ${isModal ? textPrimary : ""}`}>Product not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>{isModal ? "Close" : backLabel}</Button>
      </div>
    );
    if (!isModal) return errContent;
    return (
      <div className={`flex-1 min-h-0 flex flex-col ${bg}`}>
        <ModalHeader />
        <div className="flex-1 min-h-0 overflow-y-auto">{errContent}</div>
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
          <img
            ref={mainImgRef}
            src={allImages[safeActiveIdx]}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[2]"
            style={{ transformOrigin: "50% 50%" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className={`w-16 h-16 opacity-20 ${isModal ? (dk ? "text-gray-600" : "text-gray-300") : "text-muted-foreground"}`} />
          </div>
        )}
      </div>
      {allImages.length > 1 && (
        <div className="flex gap-2 flex-wrap sm:w-56">
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
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Product text info ─────────────────────────────────────────────────────
  const productInfo = (
    <div className="flex-1 space-y-3">
      {/* Category badges */}
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
          <Badge className={`text-xs ${isModal && dk ? "bg-gray-700 text-gray-200" : ""}`}>
            {product.brandLabel.name}
          </Badge>
        )}
      </div>

      <h1 className={`text-2xl font-bold ${isModal ? textPrimary : ""}`}>{product.name}</h1>

      {product.description && (
        <p className={`leading-relaxed ${isModal ? textMuted : "text-muted-foreground"}`}>{product.description}</p>
      )}

      {/* Product review summary */}
      {hasCommercial && reviewData && reviewData.product.total > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Stars rating={reviewData.product.avgRating} />
          <span className={`text-sm font-medium ${isModal ? textPrimary : ""}`}>{reviewData.product.avgRating.toFixed(1)}</span>
          <span className={`text-xs ${isModal ? textMuted : "text-muted-foreground"}`}>
            ({reviewData.product.total} product review{reviewData.product.total !== 1 ? "s" : ""})
          </span>
        </div>
      )}

      {/* Price + supplier count */}
      {hasCommercial ? (
        <div className="flex items-center gap-4 pt-2">
          <div>
            <p className={`text-xs ${isModal ? textMuted : "text-muted-foreground"}`}>Starting from</p>
            <p className={`text-2xl font-bold ${isModal ? (dk ? "text-blue-400" : "text-blue-600") : "text-primary"}`}>
              {product.bestPrice != null ? formatCurrency(product.bestPrice) : "—"}
            </p>
          </div>
          <div className={`h-8 border-l ${isModal ? (dk ? "border-gray-700" : "border-gray-200") : "border-border"}`} />
          <div>
            <p className={`text-xs ${isModal ? textMuted : "text-muted-foreground"}`}>Suppliers</p>
            <p className={`font-bold text-lg ${isModal ? textPrimary : ""}`}>
              {filteredListings.length}
              <span className={`text-xs font-normal ml-1 ${isModal ? textMuted : "text-muted-foreground"}`}>
                /{product.supplierCount} visible
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <Lock className="w-4 h-4 shrink-0 text-amber-500" />
          <span>Price available for approved coffee shop owners</span>
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
      <h2 className={isModal ? `font-semibold text-base ${textPrimary}` : "font-semibold text-lg"}>
        Available from Suppliers
      </h2>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Location filter */}
        {locationFilter ? (
          <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 text-xs font-medium ${locPillCls}`}>
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{locationFilter.label}</span>
            {locationFilter.radius !== null && <span className="opacity-70">· {locationFilter.radius} km</span>}
            <button type="button" onClick={() => setLocationFilter(null)} className={`ml-1 transition-colors ${locXCls}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className={`gap-1.5 text-xs ${tbOutline}`} onClick={() => setLocationModalOpen(true)}>
            <MapPin className="w-3.5 h-3.5" /> Filter by location
          </Button>
        )}
        {/* Nearest */}
        {refLocation && (
          <button
            type="button"
            onClick={() => setSupplierSort(supplierSort === "nearest" ? null : "nearest")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${supplierSort === "nearest" ? tbActive : tbInactive}`}
          >
            <Navigation className="w-3 h-3" /> Nearest
          </button>
        )}
        {/* Cheapest */}
        <button
          type="button"
          onClick={() => setSupplierSort(supplierSort === "cheapest" ? null : "cheapest")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${supplierSort === "cheapest" ? tbActive : tbInactive}`}
        >
          <Tag className="w-3 h-3" /> Cheapest
        </button>
        {/* Write review */}
        {isCafeOwner && product.listings.length > 0 && (
          <Button variant="outline" size="sm" className={`gap-1.5 text-xs ${tbOutline}`} onClick={() => setReviewModalOpen(true)}>
            <MessageSquarePlus className="w-3.5 h-3.5" /> Write a Review
          </Button>
        )}
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
          {product.listings.length === 0
            ? "No supplier listings available for this product."
            : "No suppliers match the current filters. Try adjusting your flavor, size, or location filters."}
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
        product={product}
        listings={filteredListings.length > 0 ? filteredListings.map(fl => fl.listing) : product.listings}
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

        {/* Fixed header: X | product name + categories (scrolled in) | theme toggle */}
        <ModalHeader />

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 80)}
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {/* ── Product header: images + info (always scrolls) ── */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex flex-col sm:flex-row gap-6">
              {imageGallery}
              {productInfo}
            </div>
          </div>

          {/* ── Sticky filters block ── */}
          {hasCommercial && (
            <div
              className={`sticky top-0 z-10 ${stickyBg} border-b ${stickyBorder} px-5 pt-3 pb-3 space-y-3`}
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
          <div className="px-5 pt-3 pb-5">
            {hasCommercial ? (
              <div className="space-y-3">
                {filteredListings.length === 0 ? (
                  <div className={`rounded-2xl border p-12 text-center ${dk ? "border-gray-700/60 text-gray-400" : "border-gray-100 text-gray-500"}`}>
                    {product.listings.length === 0
                      ? "No supplier listings available for this product."
                      : "No suppliers match the current filters. Try adjusting your flavor, size, or location filters."}
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

          {auxModals}
        </div>
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
            <ShoppingCart className="w-4 h-4" /> {cartCount} item{cartCount !== 1 ? "s" : ""} in cart
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
