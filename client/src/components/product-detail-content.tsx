import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Package, Store, Minus, Plus, ShoppingCart, CheckCircle2,
  Lock, AlertTriangle, LogIn, MapPin, Star, MessageSquarePlus, X,
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

// ── Variant Row ──────────────────────────────────────────────────────────────

function VariantRow({ variant, listing, product }: { variant: MarketplaceVariant; listing: MarketplaceListing; product: MarketplaceProduct }) {
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

  const label = [variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "Default";

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {outOfStock && <span className="ml-2 text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md">Out of stock</span>}
        {!outOfStock && variant.quantity <= 20 && <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">Only {variant.quantity} left</span>}
      </div>
      <div className="font-bold text-base shrink-0">{formatCurrency(variant.price)}</div>
      {!outOfStock && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button className="px-2 py-1.5 hover:bg-secondary transition-colors" onClick={() => setQty(q => Math.max(1, q - 1))}><Minus className="w-3 h-3" /></button>
            <span className="px-3 text-sm font-medium w-8 text-center">{qty}</span>
            <button className="px-2 py-1.5 hover:bg-secondary transition-colors" onClick={() => setQty(q => Math.min(variant.quantity, q + 1))}><Plus className="w-3 h-3" /></button>
          </div>
          <Button size="sm" onClick={handleAdd} className={`gap-1.5 ${inCart > 0 ? "bg-emerald-500 hover:bg-emerald-600" : ""}`} data-testid={`button-add-variant-${listing.id}-${variant.flavorId ?? 0}-${variant.sizeId ?? 0}`}>
            {inCart > 0 ? <><CheckCircle2 className="w-3.5 h-3.5" />{inCart} in cart</> : <><ShoppingCart className="w-3.5 h-3.5" />Add</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Supplier Card ──────────────────────────────────────────────────────────────

function SupplierSection({
  listing, product, visibleVariants, reviewStats,
}: {
  listing: MarketplaceListing;
  product: MarketplaceProduct;
  visibleVariants: MarketplaceVariant[];
  reviewStats?: { avgRating: number; total: number };
}) {
  const prices = visibleVariants.map(v => v.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const totalStock = visibleVariants.reduce((sum, v) => sum + v.quantity, 0);

  return (
    <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
      <div className="bg-secondary/30 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><Store className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="font-semibold">{listing.supplierName}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {visibleVariants.length} variant{visibleVariants.length !== 1 ? "s" : ""}{" · "}
                {prices.length === 0 ? "—" : prices.length === 1 || minPrice === maxPrice ? formatCurrency(minPrice) : `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`}
              </p>
              {reviewStats && reviewStats.total > 0 && (
                <div className="flex items-center gap-1">
                  <Stars rating={reviewStats.avgRating} size="xs" />
                  <span className="text-xs text-muted-foreground">({reviewStats.total})</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <Badge variant="outline" className={totalStock > 0 ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-red-200 text-red-600"}>
          {totalStock > 0 ? `${totalStock} in stock` : "Out of stock"}
        </Badge>
      </div>
      <div className="px-5">
        {visibleVariants.map((v, idx) => (
          <VariantRow key={`${v.flavorId ?? 0}-${v.sizeId ?? 0}-${idx}`} variant={v} listing={listing} product={product} />
        ))}
      </div>
    </div>
  );
}

// ── Commercial Gate — shown to visitors/pending ───────────────────────────────

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

// ── Filter badge row ──────────────────────────────────────────────────────────

function FilterBadges<T extends { id: number; name: string }>({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: T[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground shrink-0">{label}:</span>
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
}: {
  productId: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { items } = useCart();
  const { isVisitor, isPending, hasCommercial } = useAccess(user);

  // ── Filter state ─────────────────────────────────────────────────────────
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | null>(null);
  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null);
  const [locationFilter, setLocationFilter] = useState<{ lat: number; lng: number; radius: number | null; label: string } | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  // ── Product data ─────────────────────────────────────────────────────────
  const { data: product, isLoading, error } = useQuery<MarketplaceProduct>({
    queryKey: ["/api/marketplace", productId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/${productId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!productId,
  });

  // ── Review stats ─────────────────────────────────────────────────────────
  const { data: reviewData } = useQuery<{
    overall: { avgRating: number; total: number };
    bySupplier: Record<string, { avgRating: number; total: number }>;
  }>({
    queryKey: ["/api/reviews/product", productId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/product/${productId}`);
      if (!res.ok) return { overall: { avgRating: 0, total: 0 }, bySupplier: {} };
      return res.json();
    },
    enabled: !!productId && hasCommercial,
  });

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  // ── Collect unique flavors / sizes from all listings ────────────────────
  const { allFlavors, allSizes } = useMemo(() => {
    if (!product) return { allFlavors: [], allSizes: [] };
    const fMap = new Map<number, string>();
    const sMap = new Map<number, string>();
    for (const l of product.listings) {
      for (const v of l.variants) {
        if (v.flavorId && v.flavorName) fMap.set(v.flavorId, v.flavorName);
        if (v.sizeId && v.sizeName) sMap.set(v.sizeId, v.sizeName);
      }
    }
    return {
      allFlavors: Array.from(fMap.entries()).map(([id, name]) => ({ id, name })),
      allSizes: Array.from(sMap.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [product]);

  // ── Filtered listings ────────────────────────────────────────────────────
  const filteredListings = useMemo(() => {
    if (!product) return [];
    return product.listings
      .map((listing) => {
        // Apply flavor + size filter to variants
        const variants = listing.variants.filter((v) => {
          if (selectedFlavorId !== null && v.flavorId !== selectedFlavorId) return false;
          if (selectedSizeId !== null && v.sizeId !== selectedSizeId) return false;
          return true;
        });
        return { listing, variants };
      })
      .filter(({ listing, variants }) => {
        // Must have matching variants
        if (variants.length === 0) return false;
        // Must have stock in at least one visible variant
        if (variants.every((v) => v.quantity <= 0)) return false;
        // Location + radius filter
        if (locationFilter) {
          // Suppliers without coordinates are excluded when a location filter is active
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
        // Sort by distance when location is set (nearest first)
        if (!locationFilter) return 0;
        const distA = a.listing.supplierLat && a.listing.supplierLng
          ? haversineKm(locationFilter.lat, locationFilter.lng, parseFloat(a.listing.supplierLat), parseFloat(a.listing.supplierLng))
          : Infinity;
        const distB = b.listing.supplierLat && b.listing.supplierLng
          ? haversineKm(locationFilter.lat, locationFilter.lng, parseFloat(b.listing.supplierLat), parseFloat(b.listing.supplierLng))
          : Infinity;
        return distA - distB;
      });
  }, [product, selectedFlavorId, selectedSizeId, locationFilter]);

  const handleLocationConfirm = (loc: PickedLocation) => {
    setLocationFilter({
      lat: parseFloat(loc.lat),
      lng: parseFloat(loc.lng),
      radius: loc.radius ?? null,
      label: loc.address.split(",")[0]?.trim() ?? loc.address,
    });
    setLocationModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <div className="flex gap-6"><Skeleton className="w-64 h-64 rounded-2xl shrink-0" /><div className="flex-1 space-y-3"><Skeleton className="h-8 w-3/4 rounded-lg" /><Skeleton className="h-4 w-full rounded-lg" /><Skeleton className="h-4 w-2/3 rounded-lg" /></div></div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-6 text-center py-32">
        <Package className="w-14 h-14 mx-auto text-muted-foreground opacity-30 mb-4" />
        <p className="font-semibold text-lg">Product not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>{backLabel}</Button>
      </div>
    );
  }

  const isCafeOwner = user?.role === 'CAFE_OWNER' && user?.status === 'approved';

  return (
    <div className="p-6 w-full max-w-4xl mx-auto space-y-6">
      {/* Back + Cart */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back-browse">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </button>
        {hasCommercial && cartCount > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/cart")} data-testid="button-view-cart">
            <ShoppingCart className="w-4 h-4" /> {cartCount} item{cartCount !== 1 ? "s" : ""} in cart
          </Button>
        )}
      </div>

      {/* Product Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="w-full sm:w-56 h-56 rounded-2xl overflow-hidden bg-secondary/30 shrink-0">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Package className="w-16 h-16 text-muted-foreground opacity-20" /></div>
          )}
        </div>
        <div className="flex-1 space-y-3">
          {/* Category badges — always visible */}
          <div className="flex flex-wrap gap-2">
            {product.category && <Badge variant="secondary">{product.category}</Badge>}
            {product.subCategoryLabel && <Badge variant="outline">{product.subCategoryLabel.name}</Badge>}
            {product.brandLabel && (
              <Badge className="text-xs">{product.brandLabel.name}</Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold">{product.name}</h1>

          {/* Description — always visible */}
          {product.description && <p className="text-muted-foreground leading-relaxed">{product.description}</p>}

          {/* Overall review summary */}
          {hasCommercial && reviewData && reviewData.overall.total > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Stars rating={reviewData.overall.avgRating} />
              <span className="text-sm font-medium">{reviewData.overall.avgRating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({reviewData.overall.total} review{reviewData.overall.total !== 1 ? "s" : ""})</span>
            </div>
          )}

          {/* Flavor filter badges */}
          {hasCommercial && allFlavors.length > 0 && (
            <FilterBadges
              label="Flavors"
              items={allFlavors}
              selected={selectedFlavorId}
              onSelect={setSelectedFlavorId}
            />
          )}

          {/* Size filter badges */}
          {hasCommercial && allSizes.length > 0 && (
            <FilterBadges
              label="Sizes"
              items={allSizes}
              selected={selectedSizeId}
              onSelect={setSelectedSizeId}
            />
          )}

          {/* Price + Supplier count — only for approved */}
          {hasCommercial ? (
            <div className="flex items-center gap-4 pt-2">
              <div>
                <p className="text-xs text-muted-foreground">Starting from</p>
                <p className="text-2xl font-bold text-primary">{product.bestPrice != null ? formatCurrency(product.bestPrice) : "—"}</p>
              </div>
              <div className="h-8 border-l border-border" />
              <div>
                <p className="text-xs text-muted-foreground">Suppliers</p>
                <p className="font-bold text-lg">{filteredListings.length}<span className="text-xs text-muted-foreground font-normal ml-1">/{product.supplierCount} visible</span></p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <Lock className="w-4 h-4 shrink-0 text-amber-500" />
              <span>Price available for approved coffee shop owners</span>
            </div>
          )}
        </div>
      </div>

      {/* Supplier Listings — only for approved */}
      {hasCommercial ? (
        <div className="space-y-3">
          {/* Toolbar: location filter + write review */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-lg">Available from Suppliers</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Location filter button */}
              {locationFilter ? (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-1.5 text-xs font-medium">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{locationFilter.label}</span>
                  {locationFilter.radius !== null && <span className="text-amber-600">· {locationFilter.radius} km</span>}
                  <button type="button" onClick={() => setLocationFilter(null)} className="ml-1 hover:text-red-500 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setLocationModalOpen(true)}>
                  <MapPin className="w-3.5 h-3.5" /> Filter by location
                </Button>
              )}
              {/* Write review button */}
              {isCafeOwner && product.listings.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setReviewModalOpen(true)}>
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Write a Review
                </Button>
              )}
            </div>
          </div>

          {filteredListings.length === 0 ? (
            <div className="rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              {product.listings.length === 0
                ? "No supplier listings available for this product."
                : "No suppliers match the current filters. Try adjusting your flavor, size, or location filters."}
            </div>
          ) : (
            filteredListings.map(({ listing, variants }) => (
              <SupplierSection
                key={listing.id}
                listing={listing}
                product={product}
                visibleVariants={variants}
                reviewStats={reviewData?.bySupplier[String(listing.supplierId)]}
              />
            ))
          )}
        </div>
      ) : (
        <CommercialGate isPending={isPending} />
      )}

      {/* Location picker modal */}
      <LocationPickerModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onConfirm={handleLocationConfirm}
        title="Où voulez-vous rechercher ?"
        mode="search"
        showRadius
      />

      {/* Review modal — scoped to currently filtered listings */}
      {product && (
        <ReviewModal
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          product={product}
          listings={filteredListings.length > 0 ? filteredListings.map(fl => fl.listing) : product.listings}
        />
      )}
    </div>
  );
}
