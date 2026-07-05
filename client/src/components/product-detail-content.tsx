import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Package, Store, Minus, Plus, ShoppingCart, CheckCircle2,
  Lock, AlertTriangle, LogIn
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceProduct, MarketplaceListing, MarketplaceVariant } from "@shared/schema";

// ── Access helper ─────────────────────────────────────────────────────────────

function useAccess(user: any) {
  if (!user) return { isVisitor: true, isPending: false, hasCommercial: false };
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user?.role)) return { isVisitor: false, isPending: false, hasCommercial: true };
  const approved = user?.role === 'CAFE_OWNER' && user?.status === 'approved';
  return { isVisitor: false, isPending: !approved, hasCommercial: approved };
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

function SupplierSection({ listing, product }: { listing: MarketplaceListing; product: MarketplaceProduct }) {
  const prices = listing.variants.map(v => v.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const totalStock = listing.variants.reduce((sum, v) => sum + v.quantity, 0);

  return (
    <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
      <div className="bg-secondary/30 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><Store className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="font-semibold">{listing.supplierName}</p>
            <p className="text-xs text-muted-foreground">
              {listing.variants.length} variant{listing.variants.length !== 1 ? "s" : ""}{" · "}
              {prices.length === 1 || minPrice === maxPrice ? formatCurrency(minPrice) : `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={totalStock > 0 ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-red-200 text-red-600"}>
          {totalStock > 0 ? `${totalStock} in stock` : "Out of stock"}
        </Badge>
      </div>
      <div className="px-5">
        {listing.variants.map((v, idx) => (
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
      <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
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

// ── Shared Product Details Content ────────────────────────────────────────────
// Reused by both the standalone Product Details page and the Quick View modal.

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

  const { data: product, isLoading, error } = useQuery<MarketplaceProduct>({
    queryKey: ["/api/marketplace", productId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/${productId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!productId,
  });

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">{product.brandLabel.name}</Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold">{product.name}</h1>

          {/* Description — always visible */}
          {product.description && <p className="text-muted-foreground leading-relaxed">{product.description}</p>}

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
                <p className="font-bold text-lg">{product.supplierCount}</p>
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
          <h2 className="font-semibold text-lg">Available from Suppliers</h2>
          {product.listings.length === 0 ? (
            <div className="rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">No supplier listings available for this product.</div>
          ) : (
            product.listings.map(listing => <SupplierSection key={listing.id} listing={listing} product={product} />)
          )}
        </div>
      ) : (
        <CommercialGate isPending={isPending} />
      )}
    </div>
  );
}
