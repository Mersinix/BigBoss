import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination } from "@/components/ui/data-pagination";
import { useFormatCurrency } from "@/hooks/use-currency";
import {
  Building2, Package, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  Store, X, ImageOff, Users, MapPin, TrendingUp, Trophy,
} from "lucide-react";
import type {
  ProductCommercialSummary, ProductSuppliersResponse, ProductSupplierGroup, TaxonomyProductStatus,
  ProductWithTaxonomy,
} from "@shared/schema";

// Admin Products — "Informations du produit" modal (task: "Admin Products – Supplier
// Intelligence & Real-Time Product Information"). Opened from the existing "Modifier le
// produit" edit modal via a new info icon — a completely independent modal (closing it
// never touches the edit form's own state).

function useProductCommercialSummary(productId: number | null) {
  return useQuery<ProductCommercialSummary>({
    queryKey: ["/api/admin/products", productId, "commercial-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/${productId}/commercial-summary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load commercial summary");
      return res.json();
    },
    enabled: productId != null,
  });
}

function StatusBadge({ status }: { status: TaxonomyProductStatus }) {
  if (status === "active") return (
    <Badge variant="outline" className="text-[11px] gap-1 bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" />Active
    </Badge>
  );
  if (status === "inactive") return (
    <Badge variant="outline" className="text-[11px] gap-1 bg-gray-500/10 text-gray-600 border-gray-500/30 dark:text-gray-400">
      <XCircle className="w-3 h-3" />Inactive
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-[11px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400">
      <AlertTriangle className="w-3 h-3" />Rupture de stock
    </Badge>
  );
}

export function ProductIntelligenceModal({
  open, onClose, product,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductWithTaxonomy;
}) {
  const fmt = useFormatCurrency();
  const { data: summary, isLoading } = useProductCommercialSummary(open ? product.id : null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent
          hideClose
          className="sm:max-w-2xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
        >
          <button
            type="button"
            className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white"
            onClick={onClose} aria-label="Fermer" data-testid="button-close-product-intelligence-modal"
          >
            <X className="w-4 h-4" />
          </button>
          <DialogHeader><DialogTitle>Informations du produit</DialogTitle></DialogHeader>

          {/* Header — existing product information only */}
          <div className="flex items-center gap-3 pb-3 border-b">
            <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex items-center justify-center shrink-0">
              {product.imageUrl ? <img src={product.imageUrl} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{product.name}</p>
              <p className="text-[11px] text-muted-foreground">Réf. #{product.id}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {product.categoryLabel && <Badge variant="secondary" className="text-[10px]">{product.categoryLabel.name}</Badge>}
                {product.subCategoryLabel && <Badge variant="secondary" className="text-[10px]">{product.subCategoryLabel.name}</Badge>}
                {product.brandLabel && <Badge variant="secondary" className="text-[10px]">{product.brandLabel.name}</Badge>}
                <Badge variant="outline" className={`text-[10px] ${product.status === "ACTIVE" ? "bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400" : "bg-gray-500/10 text-gray-500 border-gray-500/30"}`}>
                  {product.status === "ACTIVE" ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>
          </div>

          {isLoading || !summary ? (
            <div className="space-y-3 mt-2">
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              {/* Section A — Commercial overview */}
              <div className="rounded-xl border p-3 space-y-2" data-testid="product-intel-overview">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <p className="text-xs font-semibold">Fournisseurs</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span><span className="font-bold">{summary.supplierCount}</span> <span className="text-muted-foreground">fournisseur{summary.supplierCount !== 1 ? "s" : ""}</span></span>
                  <span><span className="font-bold">{summary.storeCount}</span> <span className="text-muted-foreground">boutique{summary.storeCount !== 1 ? "s" : ""}</span></span>
                </div>
                <Button
                  size="sm" variant="outline" className="w-full justify-center"
                  onClick={() => setSuppliersOpen(true)}
                  disabled={summary.supplierCount === 0}
                  data-testid="button-view-product-suppliers"
                >
                  Voir les fournisseurs
                </Button>
              </div>

              <div className="rounded-xl border p-3 space-y-2" data-testid="product-intel-offers">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                  <p className="text-xs font-semibold">Offres</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-green-500/10 py-1.5">
                    <p className="text-base font-bold text-green-600 dark:text-green-400">{summary.offersActive}</p>
                    <p className="text-[11px] text-muted-foreground">Actives</p>
                  </div>
                  <div className="rounded-lg bg-gray-500/10 py-1.5">
                    <p className="text-base font-bold text-gray-600 dark:text-gray-400">{summary.offersInactive}</p>
                    <p className="text-[11px] text-muted-foreground">Inactives</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 py-1.5">
                    <p className="text-base font-bold text-amber-600 dark:text-amber-400">{summary.offersOutOfStock}</p>
                    <p className="text-[11px] text-muted-foreground">Rupture</p>
                  </div>
                </div>
              </div>

              {/* Phase 5 — Meilleure offre */}
              <div className="rounded-xl border p-3 space-y-2" data-testid="product-intel-best-offer">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs font-semibold">Meilleure offre</p>
                </div>
                {summary.bestOffers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucune offre active disponible actuellement pour ce produit.</p>
                ) : (
                  <div className="space-y-1.5">
                    {summary.bestOffers.map((o) => (
                      <div key={o.supplierId} className="flex items-center justify-between gap-2 text-xs bg-amber-500/5 rounded-lg px-2.5 py-1.5" data-testid={`row-best-offer-${o.supplierId}`}>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{o.supplierName}</span>
                          <span className="text-muted-foreground"> · {o.storeName}</span>
                        </div>
                        <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">{fmt(o.price)}</span>
                        <span className="text-muted-foreground shrink-0">{o.stock} en stock</span>
                      </div>
                    ))}
                    {summary.bestOffers.length > 1 && (
                      <p className="text-[11px] text-muted-foreground">{summary.bestOffers.length} offres à égalité au prix le plus bas.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Phase 6 — Ventes par fournisseur (aggregate) */}
              <div className="rounded-xl border p-3 space-y-2" data-testid="product-intel-sales">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
                  <p className="text-xs font-semibold">Ventes par fournisseur</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span><span className="font-bold">{summary.unitsSoldTotal}</span> <span className="text-muted-foreground">unité{summary.unitsSoldTotal !== 1 ? "s" : ""} vendue{summary.unitsSoldTotal !== 1 ? "s" : ""}</span></span>
                  <span><span className="font-bold">{fmt(summary.salesAmountTotal)}</span> <span className="text-muted-foreground">au total</span></span>
                </div>
                <p className="text-[11px] text-muted-foreground">Détail par fournisseur et par boutique dans "Voir les fournisseurs" ci-dessus.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProductSuppliersModal
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        productId={product.id}
        productName={product.name}
      />
    </>
  );
}

// ── Phase 4 — "Voir les fournisseurs" drill-down modal, product-specific ────
function ProductSuppliersModal({
  open, onClose, productId, productName,
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
}) {
  const fmt = useFormatCurrency();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useQuery<ProductSuppliersResponse>({
    queryKey: ["/api/admin/products", productId, "suppliers", page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products/${productId}/suppliers?page=${page}&pageSize=${pageSize}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load suppliers");
      return res.json();
    },
    enabled: open,
  });

  const toggleExpanded = (supplierId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId); else next.add(supplierId);
      return next;
    });
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        hideClose
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
      >
        <button
          type="button"
          className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white"
          onClick={onClose} aria-label="Fermer" data-testid="button-close-product-suppliers-modal"
        >
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle>Fournisseurs proposant ce produit</DialogTitle>
          <p className="text-xs text-muted-foreground">{productName}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 mt-1">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-10 text-muted-foreground">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Impossible de charger les fournisseurs.</p>
          </div>
        ) : !data || data.suppliers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucun fournisseur ne propose actuellement ce produit.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {data.suppliers.map((supplier) => (
              <SupplierRow
                key={supplier.supplierId}
                supplier={supplier}
                expanded={expanded.has(supplier.supplierId)}
                onToggle={() => toggleExpanded(supplier.supplierId)}
                fmt={fmt}
              />
            ))}
          </div>
        )}

        {total > 0 && (
          <DataPagination
            page={page} pageSize={pageSize} totalItems={total} totalPages={totalPages}
            start={start} end={end}
            onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            itemLabel="fournisseurs"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplierRow({
  supplier, expanded, onToggle, fmt,
}: {
  supplier: ProductSupplierGroup;
  expanded: boolean;
  onToggle: () => void;
  fmt: (cents: number) => string;
}) {
  return (
    <div className="rounded-xl border overflow-hidden" data-testid={`row-product-supplier-${supplier.supplierId}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {supplier.logoUrl ? <img src={supplier.logoUrl} alt="" className="w-full h-full object-cover" /> : <Store className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{supplier.supplierName}</p>
          <p className="text-[11px] text-muted-foreground">{supplier.storeCount} boutique{supplier.storeCount !== 1 ? "s" : ""} · {supplier.unitsSoldTotal} vendu{supplier.unitsSoldTotal !== 1 ? "s" : ""} ({fmt(supplier.salesAmountTotal)})</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {supplier.activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400">Active</Badge>}
          {supplier.outOfStockCount > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400">Rupture</Badge>}
          {supplier.inactiveCount > 0 && <Badge variant="outline" className="text-[10px] bg-gray-500/10 text-gray-500 border-gray-500/30">Inactive</Badge>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t divide-y">
          {supplier.stores.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">Ce fournisseur n'a pas encore de boutique publiée.</p>
          ) : (
            supplier.stores.map((store, i) => (
              <div key={store.storeId ?? i} className="bg-muted/20 px-3 py-2.5 space-y-1.5" data-testid={`row-product-store-${store.listingId}`}>
                <div className="flex items-center gap-2.5">
                  <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{store.storeName}</p>
                    {store.address && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-2.5 h-2.5 shrink-0" />{store.address}</p>
                    )}
                  </div>
                  <StatusBadge status={store.status} />
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-6">
                  <span>Prix : <span className="font-semibold text-foreground">{fmt(store.price)}</span></span>
                  <span>Stock : <span className="font-semibold text-foreground">{store.stock}</span></span>
                  <span>Vendu : <span className="font-semibold text-foreground">{store.unitsSold}</span> ({fmt(store.salesAmount)})</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
