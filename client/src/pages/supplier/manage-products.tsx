import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Package, Search, X, Pencil, Trash2, CheckCircle2, ShoppingBag, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { formatCurrency } from "@/lib/format";
import { useLocation } from "wouter";
import type { ProductWithTaxonomy, FlavorWithCount, SizeWithCount, BrandWithCount, SupplierListingWithProduct, CategoryWithCount, SubCategoryWithDetails } from "@shared/schema";
import { useSupplierCategoryStore } from "@/store/supplier-category-store";
// ── Types ─────────────────────────────────────────────────────────────────────

type AdminProductWithListing = ProductWithTaxonomy & {
  myListing: { id: number; price: number; stock: number; availableFlavorIds?: number[] | null; availableSizeIds?: number[] | null; availableBrandIds?: number[] | null } | null;
};

type SimpleFilters = { search: string; flavorId: string; sizeId: string; brandId: string };
const EMPTY_SIMPLE: SimpleFilters = { search: "", flavorId: "", sizeId: "", brandId: "" };

// ── Taxonomy Badges ───────────────────────────────────────────────────────────

function TaxBadges({ product }: { product: ProductWithTaxonomy }) {
  const flavorLabels = product.flavorLabels?.length ? product.flavorLabels : (product.flavorLabel ? [product.flavorLabel] : []);
  const sizeLabels = product.sizeLabels?.length ? product.sizeLabels : (product.sizeLabel ? [product.sizeLabel] : []);
  return (
    <div className="flex flex-wrap gap-1">
      {product.categoryLabel && <Badge variant="secondary" className="text-xs">{product.categoryLabel.name}</Badge>}
      {product.subCategoryLabel && <Badge variant="outline" className="text-xs">{product.subCategoryLabel.name}</Badge>}
      {flavorLabels.map(f => <Badge key={f.id} className="text-xs bg-pink-100 text-pink-700 hover:bg-pink-100 dark:bg-pink-950/40 dark:text-pink-400 border-0">{f.name}</Badge>)}
      {sizeLabels.map(s => <Badge key={s.id} className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 border-0">{s.name}</Badge>)}
      {product.brandLabel && <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-400 border-0">{product.brandLabel.name}</Badge>}
    </div>
  );
}

// ── Multi-select Checkboxes ───────────────────────────────────────────────────

function MultiSelectList({ label, items, selected, onChange }: { label: string; items: { id: number; name: string }[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
        {items.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">None available from admin product</p>}
        {items.map(item => (
          <label key={item.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-secondary/50 cursor-pointer">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="rounded" />
            <span className="text-sm">{item.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── No Selection Empty State ──────────────────────────────────────────────────

function NoSelectionEmptyState({ onGoToCategories, needsSubCategory }: { onGoToCategories: () => void; needsSubCategory?: boolean }) {
  return (
    <div className="p-12 flex flex-col items-center gap-4 text-center border rounded-lg border-dashed">
      <div className="rounded-full bg-muted p-4">
        <Layers className="w-8 h-8 text-muted-foreground opacity-60" />
      </div>
      <div>
        <p className="font-semibold text-base">
          {needsSubCategory ? "Select a sub-category to view products" : "Select a category to get started"}
        </p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          {needsSubCategory
            ? "Go to Categories → My Categories and click a sub-category name to filter products here."
            : "Go to Categories → My Categories, select a category and a sub-category to see products here."}
        </p>
      </div>
      <Button variant="outline" onClick={onGoToCategories} className="gap-2" data-testid="button-go-to-categories">
        <Layers className="w-4 h-4" />Go to My Categories
      </Button>
    </div>
  );
}

// ── Category + SubCategory Inline Nav ────────────────────────────────────────

function CategorySubCategoryNav({
  mappings, localCatId, localSubId, onSelectCat, onSelectSub,
}: {
  mappings: any[];
  localCatId: number | null;
  localSubId: number | null;
  onSelectCat: (id: number) => void;
  onSelectSub: (id: number) => void;
}) {
  const selectedMapping = mappings.find((m: any) => m.category?.id === localCatId);
  const subcats: any[] = selectedMapping?.subCategories ?? [];

  return (
    <div className="flex gap-3 flex-wrap">
      <div className="border rounded-lg overflow-hidden shrink-0 min-w-[140px]">
        <div className="px-3 py-1.5 bg-secondary/40 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categories</p>
        </div>
        <div className="flex flex-col max-h-40 overflow-y-auto">
          {mappings.length === 0 && <p className="text-xs text-muted-foreground px-3 py-4 text-center">No categories selected</p>}
          {mappings.map((m: any) => (
            <button key={m.category.id} onClick={() => onSelectCat(m.category.id)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0 ${localCatId === m.category.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
              data-testid={`nav-cat-${m.category.id}`}>
              {m.category.icon && <span className="text-base leading-none">{m.category.icon}</span>}
              <span className="truncate">{m.category.name}</span>
            </button>
          ))}
        </div>
      </div>
      {localCatId !== null && (
        <div className="border rounded-lg overflow-hidden shrink-0 min-w-[140px]">
          <div className="px-3 py-1.5 bg-secondary/40 border-b">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sub-categories</p>
          </div>
          <div className="flex flex-col max-h-40 overflow-y-auto">
            {subcats.length === 0 && <p className="text-xs text-muted-foreground px-3 py-4 text-center">None available</p>}
            {subcats.map((s: any) => (
              <button key={s.id} onClick={() => onSelectSub(s.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0 ${localSubId === s.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
                data-testid={`nav-sub-${s.id}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Detail Modal ──────────────────────────────────────────────────────

function ProductDetailModal({
  product, open, onClose, onAdd,
}: {
  product: AdminProductWithListing;
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{product.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-full h-44 object-cover rounded-lg border" />
          ) : (
            <div className="w-full h-44 bg-secondary rounded-lg flex items-center justify-center">
              <Package className="w-12 h-12 text-muted-foreground opacity-40" />
            </div>
          )}
          {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}
          <TaxBadges product={product} />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {product.myListing ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium px-2">
                <CheckCircle2 className="w-4 h-4" />Already in My Products
              </span>
            ) : (
              <Button onClick={onAdd} data-testid="button-add-from-detail">
                <Plus className="w-4 h-4 mr-1.5" />Add to My Products
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Variant Entry type ────────────────────────────────────────────────────────

type VEntry = { flavorId: number | null; sizeId: number | null; flavorName: string | null; sizeName: string | null; price: string; qty: string };

function buildEntries(flavors: { id: number; name: string }[], sizes: { id: number; name: string }[]): VEntry[] {
  if (flavors.length > 0 && sizes.length > 0) {
    return flavors.flatMap(f => sizes.map(s => ({ flavorId: f.id, sizeId: s.id, flavorName: f.name, sizeName: s.name, price: '', qty: '' })));
  }
  if (flavors.length > 0) return flavors.map(f => ({ flavorId: f.id, sizeId: null, flavorName: f.name, sizeName: null, price: '', qty: '' }));
  if (sizes.length > 0) return sizes.map(s => ({ flavorId: null, sizeId: s.id, flavorName: null, sizeName: s.name, price: '', qty: '' }));
  return [{ flavorId: null, sizeId: null, flavorName: null, sizeName: null, price: '', qty: '' }];
}

// ── Variant Matrix Table ──────────────────────────────────────────────────────

function VariantMatrix({ entries, onChange }: { entries: VEntry[]; onChange: (entries: VEntry[]) => void }) {
  const update = (idx: number, field: 'price' | 'qty', val: string) => {
    const next = [...entries];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40">
          <tr>
            <th className="text-left p-2.5 font-medium text-muted-foreground">Variant</th>
            <th className="text-center p-2.5 font-medium text-muted-foreground">Price (USD)</th>
            <th className="text-center p-2.5 font-medium text-muted-foreground">Qty in Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {entries.map((e, i) => {
            const label = [e.flavorName, e.sizeName].filter(Boolean).join(" · ") || "Default";
            return (
              <tr key={i} className="hover:bg-secondary/20 transition-colors">
                <td className="p-2.5 font-medium">{label}</td>
                <td className="p-2 text-center">
                  <Input
                    type="number" step="0.01" min="0"
                    className="h-8 w-24 text-center mx-auto"
                    value={e.price}
                    onChange={ev => update(i, 'price', ev.target.value)}
                    placeholder="0.00"
                    data-testid={`input-variant-price-${i}`}
                  />
                </td>
                <td className="p-2 text-center">
                  <Input
                    type="number" min="0"
                    className="h-8 w-20 text-center mx-auto"
                    value={e.qty}
                    onChange={ev => update(i, 'qty', ev.target.value)}
                    placeholder="0"
                    data-testid={`input-variant-qty-${i}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Add to My Products Modal ──────────────────────────────────────────────────

function AddListingModal({ product, flavs, szs, onClose, onSuccess }: {
  product: AdminProductWithListing;
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  const availableFlavors = useMemo(() => {
    const ids = product.flavorIds?.length ? product.flavorIds : (product.flavorId ? [product.flavorId] : []);
    return ids.length > 0 ? flavs.filter(f => ids.includes(f.id)) : [];
  }, [product.flavorIds, product.flavorId, flavs]);

  const availableSizes = useMemo(() => {
    const ids = product.sizeIds?.length ? product.sizeIds : (product.sizeId ? [product.sizeId] : []);
    return ids.length > 0 ? szs.filter(s => ids.includes(s.id)) : [];
  }, [product.sizeIds, product.sizeId, szs]);

  const [entries, setEntries] = useState<VEntry[]>(() => buildEntries(availableFlavors, availableSizes));

  const add = useMutation({
    mutationFn: async () => {
      const listingRes = await apiRequest("POST", "/api/supplier/listings", {
        productId: product.id,
        price: 0,
        stock: 0,
        availableFlavorIds: availableFlavors.map(f => f.id),
        availableSizeIds: availableSizes.map(s => s.id),
        availableBrandIds: [],
      });
      const listing = await listingRes.json();
      const listingId = listing.id;
      const variants = entries.map(e => ({
        flavorId: e.flavorId,
        sizeId: e.sizeId,
        price: parseFloat(e.price) || 0,
        quantity: parseInt(e.qty) || 0,
      }));
      await apiRequest("POST", `/api/supplier/listings/${listingId}/variants`, { variants });
    },
    onSuccess: () => {
      toast({ title: "Added to your products!" });
      onSuccess();
      onClose();
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error", variant: "destructive" }),
  });

  const hasAnyPrice = entries.some(e => parseFloat(e.price) > 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to My Products</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-lg">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
            )}
            <div>
              <p className="font-medium text-sm">{product.name}</p>
              <TaxBadges product={product} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Set Prices & Stock per Variant</Label>
            <VariantMatrix entries={entries} onChange={setEntries} />
            <p className="text-xs text-muted-foreground mt-1.5">Variants with qty 0 will be hidden from café customers.</p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending || !hasAnyPrice} data-testid="button-confirm-add-listing">
              {add.isPending ? "Adding…" : "Add to My Products"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Listing Modal ────────────────────────────────────────────────────────

function EditListingModal({ listing, flavs, szs, onClose, onSuccess }: {
  listing: SupplierListingWithProduct;
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  const availableFlavors = useMemo(() => {
    const ids = listing.product.flavorIds?.length ? listing.product.flavorIds : (listing.product.flavorId ? [listing.product.flavorId] : []);
    return ids.length > 0 ? flavs.filter(f => ids.includes(f.id)) : [];
  }, [listing.product.flavorIds, listing.product.flavorId, flavs]);

  const availableSizes = useMemo(() => {
    const ids = listing.product.sizeIds?.length ? listing.product.sizeIds : (listing.product.sizeId ? [listing.product.sizeId] : []);
    return ids.length > 0 ? szs.filter(s => ids.includes(s.id)) : [];
  }, [listing.product.sizeIds, listing.product.sizeId, szs]);

  const { data: existingVariants = [] } = useQuery({
    queryKey: ["/api/supplier/listings", listing.id, "variants"],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/listings/${listing.id}/variants`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [entries, setEntries] = useState<VEntry[]>(() => buildEntries(availableFlavors, availableSizes));

  useEffect(() => {
    if (!existingVariants.length) return;
    setEntries(buildEntries(availableFlavors, availableSizes).map(b => {
      const match = (existingVariants as any[]).find(v => v.flavorId === b.flavorId && v.sizeId === b.sizeId);
      return match ? { ...b, price: String(match.price / 100), qty: String(match.quantity) } : b;
    }));
  }, [existingVariants]);

  const save = useMutation({
    mutationFn: () => apiRequest("POST", `/api/supplier/listings/${listing.id}/variants`, {
      variants: entries.map(e => ({
        flavorId: e.flavorId,
        sizeId: e.sizeId,
        price: parseFloat(e.price) || 0,
        quantity: parseInt(e.qty) || 0,
      })),
    }),
    onSuccess: () => { toast({ title: "Variants updated" }); onSuccess(); onClose(); },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Pricing & Stock</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-lg">
            {listing.product.imageUrl ? (
              <img src={listing.product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
            )}
            <div>
              <p className="font-medium text-sm">{listing.product.name}</p>
              <TaxBadges product={listing.product} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Variant Pricing & Stock</Label>
            <VariantMatrix entries={entries} onChange={setEntries} />
            <p className="text-xs text-muted-foreground mt-1.5">Variants with qty 0 will be hidden from café customers.</p>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-listing">
              {save.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[status] ?? "bg-secondary text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ── Supplier Product Form Modal ───────────────────────────────────────────────

type SupProdForm = {
  name: string; description: string; imageUrl: string;
  categoryId: string; subCategoryId: string;
  flavorIds: number[]; sizeIds: number[]; brandId: string;
};
const EMPTY_SUP_FORM: SupProdForm = { name: "", description: "", imageUrl: "", categoryId: "", subCategoryId: "", flavorIds: [], sizeIds: [], brandId: "" };

function SupplierProductFormModal({ open, onClose, editing, cats, subs, flavs, szs, brnds, mappings = [] }: {
  open: boolean; onClose: () => void; editing: ProductWithTaxonomy | null;
  cats: CategoryWithCount[]; subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[]; szs: SizeWithCount[]; brnds: BrandWithCount[];
  mappings?: any[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<SupProdForm>(() => {
    if (editing) {
      const flavorIds = editing.flavorIds?.length ? editing.flavorIds : (editing.flavorId ? [editing.flavorId] : []);
      const sizeIds = editing.sizeIds?.length ? editing.sizeIds : (editing.sizeId ? [editing.sizeId] : []);
      return {
        name: editing.name, description: editing.description ?? "", imageUrl: editing.imageUrl ?? "",
        categoryId: editing.categoryId ? String(editing.categoryId) : "",
        subCategoryId: editing.subCategoryId ? String(editing.subCategoryId) : "",
        flavorIds, sizeIds, brandId: editing.brandId ? String(editing.brandId) : "",
      };
    }
    return EMPTY_SUP_FORM;
  });

  const setField = (key: keyof SupProdForm, value: any) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") { next.subCategoryId = ""; next.flavorIds = []; next.sizeIds = []; next.brandId = ""; }
      if (key === "subCategoryId") { next.flavorIds = []; next.sizeIds = []; next.brandId = ""; }
      return next;
    });
  };

  // Filter cats to only supplier's mapped categories
  const supplierCats = useMemo(() => {
    if (!mappings.length) return cats;
    const mappedCatIds = mappings.map((m: any) => m.category?.id).filter(Boolean);
    return cats.filter(c => mappedCatIds.includes(c.id));
  }, [cats, mappings]);

  const filteredSubs = useMemo(() => {
    if (!form.categoryId) return [];
    if (!mappings.length) return subs.filter(s => String(s.categoryId) === form.categoryId);
    const mapping = mappings.find((m: any) => String(m.category?.id) === form.categoryId);
    if (!mapping) return subs.filter(s => String(s.categoryId) === form.categoryId);
    const mappingSubIds = mapping.subCategories?.map((sc: any) => sc.id) ?? [];
    return subs.filter(s => String(s.categoryId) === form.categoryId && mappingSubIds.includes(s.id));
  }, [form.categoryId, subs, mappings]);
  const filterBySubCat = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = form.subCategoryId ? parseInt(form.subCategoryId) : null;
    const catId = form.categoryId ? parseInt(form.categoryId) : null;
    const catSubIds = subs.filter(s => String(s.categoryId) === form.categoryId).map(s => s.id);
    if (subId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };
  const filteredFlavs = useMemo(() => filterBySubCat(flavs), [flavs, form.categoryId, form.subCategoryId, subs]);
  const filteredSzs = useMemo(() => filterBySubCat(szs), [szs, form.categoryId, form.subCategoryId, subs]);
  const filteredBrnds = useMemo(() => filterBySubCat(brnds), [brnds, form.categoryId, form.subCategoryId, subs]);

  const save = useMutation({
    mutationFn: (data: any) =>
      editing
        ? apiRequest("PATCH", `/api/supplier/created-products/${editing.id}`, data)
        : apiRequest("POST", "/api/supplier/created-products", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/created-products"] });
      toast({ title: editing ? "Product updated" : "Product submitted for review!" });
      onClose();
    },
    onError: () => toast({ title: "Error saving product", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Product name is required", variant: "destructive" });
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      categoryId: form.categoryId || null,
      subCategoryId: form.subCategoryId || null,
      brandId: form.brandId || null,
      flavorId: form.flavorIds[0] ?? null,
      sizeId: form.sizeIds[0] ?? null,
      flavorIds: form.flavorIds.length > 0 ? form.flavorIds : null,
      sizeIds: form.sizeIds.length > 0 ? form.sizeIds : null,
      category: supplierCats.find(c => String(c.id) === form.categoryId)?.name ?? "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "Create New Product"}</DialogTitle>
          {!editing && <p className="text-sm text-muted-foreground mt-1">Submitted products go to admin for review and approval.</p>}
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Product Name *</Label>
            <Input data-testid="input-sprod-name" value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Single Origin Ethiopia 250g" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input data-testid="input-sprod-desc" value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Brief description" />
          </div>
          <div className="space-y-1.5">
            <Label>Image URL</Label>
            <Input data-testid="input-sprod-image" value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={v => setField("categoryId", v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="select-sprod-category"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {supplierCats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sub-category</Label>
              <Select value={form.subCategoryId} onValueChange={v => setField("subCategoryId", v === "__none__" ? "" : v)} disabled={!form.categoryId}>
                <SelectTrigger data-testid="select-sprod-subcat"><SelectValue placeholder={form.categoryId ? "Select…" : "Pick category first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {filteredSubs.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <MultiSelectList label="Flavors" items={filteredFlavs} selected={form.flavorIds} onChange={ids => setField("flavorIds", ids)} />
          <MultiSelectList label="Sizes" items={filteredSzs} selected={form.sizeIds} onChange={ids => setField("sizeIds", ids)} />
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={form.brandId} onValueChange={v => setField("brandId", v === "__none__" ? "" : v)}>
              <SelectTrigger data-testid="select-sprod-brand"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {filteredBrnds.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={save.isPending || !form.name.trim()} data-testid="button-save-sprod">
              {save.isPending ? "Saving…" : editing ? "Save Changes" : "Submit for Review"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab 3: New Product ────────────────────────────────────────────────────────

function NewProductTab({ cats, subs, flavs, szs, brnds, mappings = [] }: {
  cats: CategoryWithCount[]; subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[]; szs: SizeWithCount[]; brnds: BrandWithCount[];
  mappings?: any[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<ProductWithTaxonomy | null>(null);

  const { data: createdProducts = [], isLoading } = useQuery<ProductWithTaxonomy[]>({
    queryKey: ["/api/supplier/created-products"],
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/supplier/created-products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/created-products"] });
      toast({ title: "Product deleted" });
    },
    onError: () => toast({ title: "Error deleting product", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Submit new products for admin review and approval.</p>
        <Button onClick={() => { setEditingProd(null); setModalOpen(true); }} data-testid="button-create-supplier-product">
          <Plus className="w-4 h-4 mr-1.5" />New Product
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : createdProducts.length === 0 ? (
        <div className="p-12 flex flex-col items-center gap-3 text-center border rounded-lg bg-secondary/10">
          <Package className="w-10 h-10 text-muted-foreground opacity-40" />
          <div>
            <p className="font-medium">No products created yet</p>
            <p className="text-sm text-muted-foreground mt-1">Click "New Product" to submit a product for admin approval.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12" />
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {createdProducts.map(p => (
                <TableRow key={p.id} data-testid={`row-created-product-${p.id}`} className="hover:bg-secondary/20">
                  <TableCell className="p-3">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                        <Package className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                    <TaxBadges product={p} />
                  </TableCell>
                  <TableCell><StatusBadge status={(p as any).status ?? 'PENDING'} /></TableCell>
                  <TableCell className="text-right">
                    {(p as any).status === 'PENDING' && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingProd(p); setModalOpen(true); }} data-testid={`button-edit-sprod-${p.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {(p as any).status === 'PENDING' && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
                        if (confirm(`Delete "${p.name}"?`)) deleteMut.mutate(p.id);
                      }} data-testid={`button-delete-sprod-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {modalOpen && (
        <SupplierProductFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingProd(null); }}
          editing={editingProd}
          cats={cats} subs={subs} flavs={flavs} szs={szs} brnds={brnds}
          mappings={mappings}
        />
      )}
    </div>
  );
}

// ── Tab 1: Admin Products ─────────────────────────────────────────────────────

function AdminProductsTab({
  mappings,
  flavs, szs,
  onGoToCategories,
}: {
  mappings: any[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  onGoToCategories: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detailProduct, setDetailProduct] = useState<AdminProductWithListing | null>(null);
  const [addingProduct, setAddingProduct] = useState<AdminProductWithListing | null>(null);

  const { selectedCategoryId, selectedSubCategoryId, setSelectedCategory, setSelectedSubCategory } = useSupplierCategoryStore();

  const hasMappings = mappings.length > 0;

  // Seed the store from the first mapping when no selection is persisted
  useEffect(() => {
    if (hasMappings && selectedCategoryId === null) {
      const first = mappings[0] as any;
      setSelectedCategory(first.category.id);
      const firstSub = first.subCategories?.[0];
      if (firstSub) setSelectedSubCategory(firstSub.id);
    }
  }, [hasMappings, selectedCategoryId, mappings, setSelectedCategory, setSelectedSubCategory]);

  // Validate stored selection against current mappings
  const validCatId = useMemo(() => {
    if (selectedCategoryId === null) return null;
    return (mappings as any[]).some((m: any) => m.category.id === selectedCategoryId)
      ? selectedCategoryId
      : null;
  }, [selectedCategoryId, mappings]);

  const handleSelectCat = (id: number) => {
    setSelectedCategory(id);
    const m = (mappings as any[]).find((m: any) => m.category.id === id);
    const firstSub = m?.subCategories?.[0];
    if (firstSub) setSelectedSubCategory(firstSub.id);
  };

  // Fetch ALL products for this supplier's mapped categories (backend handles the multi-category filter)
  const { data: allAdminProducts = [], isLoading } = useQuery<AdminProductWithListing[]>({
    queryKey: ["/api/supplier/admin-products"],
    queryFn: async () => {
      const res = await fetch("/api/supplier/admin-products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: hasMappings,
  });

  // Local filter: narrow by selected category/subcategory for the nav UX
  const adminProducts = useMemo(() => {
    if (!validCatId) return allAdminProducts;
    if (selectedSubCategoryId) {
      return (allAdminProducts as any[]).filter((p: any) => p.subCategoryId === selectedSubCategoryId);
    }
    return (allAdminProducts as any[]).filter((p: any) => p.categoryId === validCatId);
  }, [allAdminProducts, validCatId, selectedSubCategoryId]);

  const displayed = useMemo(() => {
    if (!search.trim()) return adminProducts;
    const q = search.toLowerCase();
    return adminProducts.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [adminProducts, search]);

  return (
    <div className="space-y-4">
      <CategorySubCategoryNav
        mappings={mappings}
        localCatId={validCatId}
        localSubId={selectedSubCategoryId}
        onSelectCat={handleSelectCat}
        onSelectSub={setSelectedSubCategory}
      />

      {hasMappings && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-admin-products" />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="h-9 text-muted-foreground">
              <X className="w-4 h-4 mr-1" />Clear
            </Button>
          )}
        </div>
      )}

      {!hasMappings ? (
        <NoSelectionEmptyState onGoToCategories={onGoToCategories} />
      ) : isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="p-12 flex flex-col items-center gap-3 text-center border rounded-lg">
          <Package className="w-10 h-10 text-muted-foreground opacity-40" />
          <div>
            <p className="font-medium">No products available</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "Try adjusting your search." : "No admin products found for your selected category."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14" />
                <TableHead>Product</TableHead>
                <TableHead>Taxonomy</TableHead>
                <TableHead className="text-right w-40">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map(p => (
                <TableRow key={p.id} className="hover:bg-secondary/20 cursor-pointer" onClick={() => setDetailProduct(p)} data-testid={`row-admin-product-${p.id}`}>
                  <TableCell className="p-3">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-border/50" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                  </TableCell>
                  <TableCell><TaxBadges product={p} /></TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    {p.myListing ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1.5 rounded-md font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />Added
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setAddingProduct(p)} data-testid={`button-add-to-my-products-${p.id}`}>
                        <Plus className="w-3.5 h-3.5 mr-1" />Add to My Products
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          open={!!detailProduct}
          onClose={() => setDetailProduct(null)}
          onAdd={() => { setAddingProduct(detailProduct); setDetailProduct(null); }}
        />
      )}

      {addingProduct && (
        <AddListingModal
          product={addingProduct}
          flavs={flavs}
          szs={szs}
          onClose={() => setAddingProduct(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["/api/supplier/admin-products"] });
            qc.invalidateQueries({ queryKey: ["/api/supplier/listings"] });
            invalidateMarketplace(qc);
          }}
        />
      )}
    </div>
  );
}

// ── Tab 2: My Products ────────────────────────────────────────────────────────

function MyProductsTab({
  mappings,
  flavs, szs, brnds,
  onGoToCategories,
}: {
  mappings: any[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  brnds: BrandWithCount[];
  onGoToCategories: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<SimpleFilters>(EMPTY_SIMPLE);
  const [editingListing, setEditingListing] = useState<SupplierListingWithProduct | null>(null);

  const { selectedCategoryId, selectedSubCategoryId, setSelectedCategory, setSelectedSubCategory } = useSupplierCategoryStore();

  const hasMappings = mappings.length > 0;

  // Seed the store from the first mapping when no selection is persisted
  useEffect(() => {
    if (hasMappings && selectedCategoryId === null) {
      const first = mappings[0] as any;
      setSelectedCategory(first.category.id);
      const firstSub = first.subCategories?.[0];
      if (firstSub) setSelectedSubCategory(firstSub.id);
    }
  }, [hasMappings, selectedCategoryId, mappings, setSelectedCategory, setSelectedSubCategory]);

  // Validate stored selection against current mappings
  const validCatId = useMemo(() => {
    if (selectedCategoryId === null) return null;
    return (mappings as any[]).some((m: any) => m.category.id === selectedCategoryId)
      ? selectedCategoryId
      : null;
  }, [selectedCategoryId, mappings]);

  const handleSelectCat = (id: number) => {
    setSelectedCategory(id);
    const m = (mappings as any[]).find((m: any) => m.category.id === id);
    const firstSub = m?.subCategories?.[0];
    if (firstSub) setSelectedSubCategory(firstSub.id);
    setFilters(EMPTY_SIMPLE);
  };

  const setField = (key: keyof SimpleFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: value === "__all__" ? "" : value }));
  };

  const params = new URLSearchParams();
  if (validCatId) params.set("categoryId", String(validCatId));
  if (selectedSubCategoryId) params.set("subCategoryId", String(selectedSubCategoryId));
  if (filters.flavorId) params.set("flavorId", filters.flavorId);
  if (filters.sizeId) params.set("sizeId", filters.sizeId);
  if (filters.brandId) params.set("brandId", filters.brandId);

  const { data: listings = [], isLoading } = useQuery<SupplierListingWithProduct[]>({
    queryKey: ["/api/supplier/listings", validCatId, selectedSubCategoryId, filters.flavorId, filters.sizeId, filters.brandId],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/listings?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: hasMappings,
  });

  const displayed = useMemo(() => {
    if (!filters.search.trim()) return listings;
    const q = filters.search.toLowerCase();
    return listings.filter(l => l.product.name.toLowerCase().includes(q));
  }, [listings, filters.search]);

  const hasExtraFilters = filters.flavorId || filters.sizeId || filters.brandId || filters.search;

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/supplier/listings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/listings"] });
      qc.invalidateQueries({ queryKey: ["/api/supplier/admin-products"] });
      invalidateMarketplace(qc);
      toast({ title: "Removed from your products" });
    },
    onError: () => toast({ title: "Error removing", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <CategorySubCategoryNav
        mappings={mappings}
        localCatId={validCatId}
        localSubId={selectedSubCategoryId}
        onSelectCat={handleSelectCat}
        onSelectSub={setSelectedSubCategory}
      />

      {hasMappings && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Search…" value={filters.search} onChange={e => setField("search", e.target.value)} data-testid="input-search-my-products" />
          </div>
          <Select value={filters.flavorId} onValueChange={v => setField("flavorId", v)}>
            <SelectTrigger className="h-9 min-w-[110px]"><SelectValue placeholder="Flavor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Flavors</SelectItem>
              {flavs.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.sizeId} onValueChange={v => setField("sizeId", v)}>
            <SelectTrigger className="h-9 min-w-[110px]"><SelectValue placeholder="Size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sizes</SelectItem>
              {szs.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.brandId} onValueChange={v => setField("brandId", v)}>
            <SelectTrigger className="h-9 min-w-[110px]"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Brands</SelectItem>
              {brnds.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasExtraFilters && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_SIMPLE)} className="h-9 text-muted-foreground">
              <X className="w-4 h-4 mr-1" />Clear
            </Button>
          )}
        </div>
      )}

      {!hasMappings ? (
        <NoSelectionEmptyState onGoToCategories={onGoToCategories} />
      ) : isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="p-12 flex flex-col items-center gap-3 text-center border rounded-lg">
          <ShoppingBag className="w-10 h-10 text-muted-foreground opacity-40" />
          <div>
            <p className="font-medium">No products in your catalog</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasExtraFilters ? "Try adjusting your filters." : "Go to the Admin Products tab to add products to your catalog."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14" />
                <TableHead>Product</TableHead>
                <TableHead>Taxonomy</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map(l => (
                <TableRow key={l.id} className="hover:bg-secondary/20" data-testid={`row-my-listing-${l.id}`}>
                  <TableCell className="p-3">
                    {l.product.imageUrl ? (
                      <img src={l.product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-border/50" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{l.product.name}</p>
                    {l.product.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{l.product.description}</p>}
                  </TableCell>
                  <TableCell><TaxBadges product={l.product} /></TableCell>
                  <TableCell className="font-medium">{formatCurrency(l.price)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${l.stock > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"}`}>
                      {l.stock > 0 ? `${l.stock} units` : "Out of stock"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingListing(l)} data-testid={`button-edit-listing-${l.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
                      if (confirm(`Remove "${l.product.name}" from your products?`)) removeMutation.mutate(l.id);
                    }} data-testid={`button-remove-listing-${l.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editingListing && (
        <EditListingModal
          listing={editingListing}
          flavs={flavs}
          szs={szs}
          onClose={() => setEditingListing(null)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["/api/supplier/listings"] }); invalidateMarketplace(qc); }}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManageProducts() {
  const [, navigate] = useLocation();
  const { data: cats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: subs = [] } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });
  const { data: flavs = [] } = useQuery<FlavorWithCount[]>({ queryKey: ["/api/flavors"] });
  const { data: szs = [] } = useQuery<SizeWithCount[]>({ queryKey: ["/api/sizes"] });
  const { data: brnds = [] } = useQuery<BrandWithCount[]>({ queryKey: ["/api/brands"] });

  const { data: mappings = [] } = useQuery({
    queryKey: ["/api/supplier/categories"],
    queryFn: async () => {
      const res = await fetch("/api/supplier/categories", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleGoToCategories = () => navigate("/supplier/categories");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Browse the admin catalog and manage your product listings with custom pricing and stock.
        </p>
      </div>

      <Tabs defaultValue="admin-products" className="w-full">
        <TabsList className="mb-2">
          <TabsTrigger value="admin-products" data-testid="tab-admin-products">
            <Package className="w-4 h-4 mr-1.5" />Admin Products
          </TabsTrigger>
          <TabsTrigger value="my-products" data-testid="tab-my-products">
            <ShoppingBag className="w-4 h-4 mr-1.5" />My Products
          </TabsTrigger>
          <TabsTrigger value="new-product" data-testid="tab-new-product">
            <Plus className="w-4 h-4 mr-1.5" />New Product
          </TabsTrigger>
        </TabsList>

        <TabsContent value="admin-products">
          <AdminProductsTab
            mappings={mappings as any[]}
            flavs={flavs}
            szs={szs}
            onGoToCategories={handleGoToCategories}
          />
        </TabsContent>

        <TabsContent value="my-products">
          <MyProductsTab
            mappings={mappings as any[]}
            flavs={flavs}
            szs={szs}
            brnds={brnds}
            onGoToCategories={handleGoToCategories}
          />
        </TabsContent>

        <TabsContent value="new-product">
          <NewProductTab cats={cats} subs={subs} flavs={flavs} szs={szs} brnds={brnds} mappings={mappings as any[]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
