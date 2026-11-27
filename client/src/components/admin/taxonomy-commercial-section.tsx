import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  Building2, Package, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  Store, X, ImageOff, Users, MapPin, Layers,
} from "lucide-react";
import type {
  TaxonomyEntityType, TaxonomyCommercialSummary, TaxonomySuppliersResponse,
  TaxonomySupplierGroup, TaxonomyProductStatus,
} from "@shared/schema";

// Admin Categories Management — "Informations commerciales" section + "Voir les
// fournisseurs" modal (task: "Admin Categories Management: Supplier Coverage &
// Catalog Intelligence"). Shared across all 5 taxonomy detail modals
// (Categories/SubCategories/Flavors/Sizes/Brands in categories-page.tsx) —
// parametrized by `type`/`id` only, never duplicated per entity.

const ENTITY_EMPTY_LABEL: Record<TaxonomyEntityType, string> = {
  category: "cette catégorie",
  subcategory: "cette sous-catégorie",
  flavor: "cette saveur",
  size: "cette taille",
  brand: "cette marque",
};

function useTaxonomyCommercialSummary(type: TaxonomyEntityType, id: number | null) {
  return useQuery<TaxonomyCommercialSummary>({
    queryKey: ["/api/admin/taxonomy", type, id, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/taxonomy/${type}/${id}/summary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load commercial summary");
      return res.json();
    },
    enabled: id != null,
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

// ── "Informations commerciales" section — rendered inside the existing
// Category/SubCategory/Flavor/Size/Brand detail modal, below the existing
// icon/name/description/active/delete/cancel/save fields. Never replaces that
// modal — only appends this section. ────────────────────────────────────────
export function TaxonomyCommercialSection({
  type, id, entityName,
}: {
  type: TaxonomyEntityType;
  id: number;
  entityName: string;
}) {
  const { data: summary, isLoading } = useTaxonomyCommercialSummary(type, id);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  if (isLoading || !summary) {
    return (
      <div className="pt-3 border-t space-y-3">
        <p className="text-sm font-semibold">Informations commerciales</p>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="pt-3 border-t space-y-3">
      <p className="text-sm font-semibold">Informations commerciales</p>

      {/* Fournisseurs */}
      <div className="rounded-xl border p-3 space-y-2" data-testid="taxonomy-commercial-suppliers">
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
          data-testid="button-view-taxonomy-suppliers"
        >
          Voir les fournisseurs
        </Button>
      </div>

      {/* Produits */}
      <div className="rounded-xl border p-3 space-y-2" data-testid="taxonomy-commercial-products">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-600 shrink-0" />
          <p className="text-xs font-semibold">Produits</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 py-1.5">
            <p className="text-base font-bold">{summary.productTotal}</p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg bg-green-500/10 py-1.5">
            <p className="text-base font-bold text-green-600 dark:text-green-400">{summary.productActive}</p>
            <p className="text-[11px] text-muted-foreground">Actifs</p>
          </div>
          <div className="rounded-lg bg-gray-500/10 py-1.5">
            <p className="text-base font-bold text-gray-600 dark:text-gray-400">{summary.productInactive}</p>
            <p className="text-[11px] text-muted-foreground">Inactifs</p>
          </div>
          <div className="rounded-lg bg-amber-500/10 py-1.5">
            <p className="text-base font-bold text-amber-600 dark:text-amber-400">{summary.productOutOfStock}</p>
            <p className="text-[11px] text-muted-foreground">Rupture</p>
          </div>
        </div>
      </div>

      {/* Coverage — varies by entity type */}
      {type === "category" && (
        <CategoryCoverageTable coverage={summary.subCategoryCoverage ?? []} />
      )}
      {type === "subcategory" && (
        <SubCategoryCoverage
          parentCategory={summary.parentCategory ?? null}
          linkedFlavors={summary.linkedFlavors ?? []}
          linkedSizes={summary.linkedSizes ?? []}
          linkedBrands={summary.linkedBrands ?? []}
        />
      )}

      <TaxonomySuppliersModal
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        type={type}
        id={id}
        entityName={entityName}
      />
    </div>
  );
}

// ── Phase 4 — Category detail modal's subcategory coverage table ────────────
function CategoryCoverageTable({ coverage }: { coverage: { id: number; name: string; supplierCount: number; productCount: number; covered: boolean }[] }) {
  if (!coverage.length) return null;
  return (
    <div className="rounded-xl border p-3 space-y-2" data-testid="taxonomy-category-coverage">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
        <p className="text-xs font-semibold">Couverture des sous-catégories</p>
      </div>
      <div className="space-y-1">
        {coverage.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b last:border-b-0" data-testid={`row-coverage-${c.id}`}>
            <span className="truncate min-w-0 flex-1">{c.name}</span>
            <span className="text-muted-foreground shrink-0">{c.supplierCount} fourn.</span>
            <span className="text-muted-foreground shrink-0">{c.productCount} prod.</span>
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${c.covered
                ? "bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400"
                : "bg-gray-500/10 text-gray-500 border-gray-500/30"}`}
            >
              {c.covered ? "Couvert" : "Non couvert"}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Phase 2 §3 — SubCategory detail modal's own coverage block ──────────────
function SubCategoryCoverage({
  parentCategory, linkedFlavors, linkedSizes, linkedBrands,
}: {
  parentCategory: { id: number; name: string } | null;
  linkedFlavors: { id: number; name: string }[];
  linkedSizes: { id: number; name: string }[];
  linkedBrands: { id: number; name: string }[];
}) {
  return (
    <div className="rounded-xl border p-3 space-y-2" data-testid="taxonomy-subcategory-coverage">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
        <p className="text-xs font-semibold">Couverture</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Catégorie parente : <span className="font-medium text-foreground">{parentCategory?.name ?? "—"}</span>
      </p>
      {([
        ["Saveurs associées", linkedFlavors],
        ["Tailles associées", linkedSizes],
        ["Marques associées", linkedBrands],
      ] as const).map(([label, items]) => (
        <div key={label} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground shrink-0">{label} :</span>
          {items.length === 0
            ? <span className="text-[11px] text-muted-foreground">—</span>
            : items.map((it) => <Badge key={it.id} variant="secondary" className="text-[10px]">{it.name}</Badge>)}
        </div>
      ))}
    </div>
  );
}

// ── Phase 3 — "Voir les fournisseurs" drill-down modal ───────────────────────
export function TaxonomySuppliersModal({
  open, onClose, type, id, entityName,
}: {
  open: boolean;
  onClose: () => void;
  type: TaxonomyEntityType;
  id: number;
  entityName: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useQuery<TaxonomySuppliersResponse>({
    queryKey: ["/api/admin/taxonomy", type, id, "suppliers", page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/admin/taxonomy/${type}/${id}/suppliers?page=${page}&pageSize=${pageSize}`, { credentials: "include" });
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
      {/* Thin scrollbar treatment (task: "Admin Categories – UI Refinements") — same
          webkit-scrollbar classes already used throughout the app (e.g. categories-page.tsx's
          own MODAL_SCROLLBAR, payment-details-modal.tsx) instead of the browser's default
          (much thicker) scrollbar this modal was previously left with. */}
      <DialogContent
        hideClose
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
      >
        <button
          type="button"
          className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white"
          onClick={onClose} aria-label="Fermer" data-testid="button-close-taxonomy-suppliers-modal"
        >
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle>Fournisseurs associés</DialogTitle>
          <p className="text-xs text-muted-foreground">{entityName}</p>
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
            <p className="text-sm">Aucun fournisseur ne propose actuellement de produits dans {ENTITY_EMPTY_LABEL[type]}.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {data.suppliers.map((supplier) => (
              <SupplierRow
                key={supplier.supplierId}
                supplier={supplier}
                expanded={expanded.has(supplier.supplierId)}
                onToggle={() => toggleExpanded(supplier.supplierId)}
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

function SupplierRow({ supplier, expanded, onToggle }: { supplier: TaxonomySupplierGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border overflow-hidden" data-testid={`row-taxonomy-supplier-${supplier.supplierId}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {supplier.logoUrl ? <img src={supplier.logoUrl} alt="" className="w-full h-full object-cover" /> : <Store className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{supplier.supplierName}</p>
          <p className="text-[11px] text-muted-foreground">{supplier.storeCount} boutique{supplier.storeCount !== 1 ? "s" : ""} · {supplier.productCount} produit{supplier.productCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {supplier.activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400">{supplier.activeCount} active{supplier.activeCount !== 1 ? "s" : ""}</Badge>}
          {supplier.outOfStockCount > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400">{supplier.outOfStockCount} rupture{supplier.outOfStockCount !== 1 ? "s" : ""}</Badge>}
          {supplier.inactiveCount > 0 && <Badge variant="outline" className="text-[10px] bg-gray-500/10 text-gray-500 border-gray-500/30">{supplier.inactiveCount} inactive{supplier.inactiveCount !== 1 ? "s" : ""}</Badge>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t divide-y">
          {supplier.stores.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">Ce fournisseur n'a pas encore de boutique publiée.</p>
          ) : (
            supplier.stores.map((store, i) => <StoreRow key={store.storeId ?? i} store={store} />)
          )}
        </div>
      )}
    </div>
  );
}

function StoreRow({ store }: { store: TaxonomySupplierGroup["stores"][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-muted/20">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left">
        <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{store.storeName}</p>
          {store.address && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-2.5 h-2.5 shrink-0" />{store.address}</p>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{store.productCount} produit{store.productCount !== 1 ? "s" : ""}</span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {store.products.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Aucun produit.</p>
          ) : (
            store.products.map((p) => (
              <div key={p.listingId} className="flex items-center gap-2.5 bg-background rounded-lg p-2 border" data-testid={`row-taxonomy-product-${p.listingId}`}>
                <div className="w-8 h-8 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
                  {p.productImageUrl ? <img src={p.productImageUrl} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{p.productName}</p>
                  {p.sku && <p className="text-[10px] text-muted-foreground">SKU : {p.sku}</p>}
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
