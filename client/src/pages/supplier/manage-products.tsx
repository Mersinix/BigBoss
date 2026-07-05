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
import { Plus, Package, Search, X, Pencil, Trash2, CheckCircle2, ShoppingBag, Layers, LayoutGrid, LayoutList } from "lucide-react";
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
      {product.brandLabel && <Badge className="text-xs">{product.brandLabel.name}</Badge>}
      {flavorLabels.map(f => <Badge key={f.id} className="text-xs bg-pink-300 text-pink-700 hover:bg-pink-300 dark:bg-pink-950/40 dark:text-pink-400 border-0">{f.name}</Badge>)}
      {sizeLabels.map(s => <Badge key={s.id} className="text-xs bg-amber-400 text-amber-700 hover:bg-amber-400 dark:bg-amber-950/40 dark:text-amber-400 border-0">{s.name}</Badge>)}
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
type VariantGroup = { id: string; sizeId: string; flavorIds: number[]; price: string; qty: string; flavorStocks: Record<string, string> };

function buildEntries(flavors: { id: number; name: string }[], sizes: { id: number; name: string }[]): VEntry[] {
  if (flavors.length > 0 && sizes.length > 0) {
    return flavors.flatMap(f => sizes.map(s => ({ flavorId: f.id, sizeId: s.id, flavorName: f.name, sizeName: s.name, price: '', qty: '' })));
  }
  if (flavors.length > 0) return flavors.map(f => ({ flavorId: f.id, sizeId: null, flavorName: f.name, sizeName: null, price: '', qty: '' }));
  if (sizes.length > 0) return sizes.map(s => ({ flavorId: null, sizeId: s.id, flavorName: null, sizeName: s.name, price: '', qty: '' }));
  return [{ flavorId: null, sizeId: null, flavorName: null, sizeName: null, price: '', qty: '' }];
}

function groupsToEntries(groups: VariantGroup[], flavors: { id: number; name: string }[], sizes: { id: number; name: string }[]): VEntry[] {
  const entries: VEntry[] = [];
  for (const g of groups) {
    const price = g.price;
    const size = g.sizeId ? sizes.find(s => String(s.id) === g.sizeId) : null;
    const selectedFlavors = g.flavorIds.length ? flavors.filter(f => g.flavorIds.includes(f.id)) : [];
    if (selectedFlavors.length && size) {
      selectedFlavors.forEach(f => entries.push({
        flavorId: f.id, sizeId: size.id, flavorName: f.name, sizeName: size.name,
        price, qty: g.flavorStocks[String(f.id)] ?? g.qty,
      }));
    } else if (selectedFlavors.length) {
      selectedFlavors.forEach(f => entries.push({
        flavorId: f.id, sizeId: null, flavorName: f.name, sizeName: null,
        price, qty: g.flavorStocks[String(f.id)] ?? g.qty,
      }));
    } else if (size) {
      entries.push({ flavorId: null, sizeId: size.id, flavorName: null, sizeName: size.name, price, qty: g.qty });
    } else {
      entries.push({ flavorId: null, sizeId: null, flavorName: null, sizeName: null, price, qty: g.qty });
    }
  }
  return entries;
}

function variantsToGroups(variants: any[], flavors: { id: number; name: string }[], sizes: { id: number; name: string }[]): VariantGroup[] {
  if (!variants.length) {
    return [{ id: crypto.randomUUID(), sizeId: "", flavorIds: [], price: "", qty: "", flavorStocks: {} }];
  }
  const bySize = new Map<string, any[]>();
  for (const v of variants) {
    const key = v.sizeId != null ? String(v.sizeId) : "__none__";
    if (!bySize.has(key)) bySize.set(key, []);
    bySize.get(key)!.push(v);
  }
  const groups: VariantGroup[] = [];
  for (const [sizeKey, entries] of Array.from(bySize.entries())) {
    const flavorEntries = entries.filter((e: any) => e.flavorId != null);
    const noFlavorEntry = entries.find((e: any) => e.flavorId == null);
    const flavorIds = flavorEntries.map((e: any) => e.flavorId);
    const flavorStocks: Record<string, string> = {};
    for (const e of flavorEntries) flavorStocks[String(e.flavorId)] = String(e.quantity);
    const price = entries[0] ? String(entries[0].price / 100) : "";
    const qty = noFlavorEntry ? String(noFlavorEntry.quantity) : "";
    groups.push({
      id: crypto.randomUUID(),
      sizeId: sizeKey === "__none__" ? "" : sizeKey,
      flavorIds, price, qty, flavorStocks,
    });
  }
  return groups;
}

function VariantGroupBuilder({
  flavors, sizes, groups, onChange,
}: {
  flavors: { id: number; name: string }[];
  sizes: { id: number; name: string }[];
  groups: VariantGroup[];
  onChange: (groups: VariantGroup[]) => void;
}) {
  const addGroup = () => onChange([...groups, { id: crypto.randomUUID(), sizeId: "", flavorIds: [], price: "", qty: "", flavorStocks: {} }]);
  const update = (id: string, patch: Partial<VariantGroup>) => onChange(groups.map(g => g.id === id ? { ...g, ...patch } : g));
  const remove = (id: string) => onChange(groups.filter(g => g.id !== id));

  return (
    <div className="space-y-3">
      {groups.map((g, idx) => {
        const selectedFlavors = flavors.filter(f => g.flavorIds.includes(f.id));
        const hasFlavors = selectedFlavors.length > 0;
        return (
          <div key={g.id} className="border rounded-lg p-3 space-y-3 bg-secondary/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Variant group {idx + 1}</p>
              {groups.length > 1 && (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => remove(g.id)}>Remove</Button>
              )}
            </div>
            {sizes.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Size</Label>
                <Select value={g.sizeId || "__none__"} onValueChange={v => update(g.id, { sizeId: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select size (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any / no size</SelectItem>
                    {sizes.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {flavors.length > 0 && (
              <MultiSelectList
                label="Flavors (multi-select)"
                items={flavors}
                selected={g.flavorIds}
                onChange={ids => {
                  const newStocks = { ...g.flavorStocks };
                  Object.keys(newStocks).forEach(k => { if (!ids.includes(parseInt(k))) delete newStocks[k]; });
                  update(g.id, { flavorIds: ids, flavorStocks: newStocks });
                }}
              />
            )}
            <div className="space-y-1">
              <Label className="text-xs">Price (TND)</Label>
              <Input type="number" step="0.01" min="0" value={g.price} onChange={e => update(g.id, { price: e.target.value })} placeholder="0.00" />
            </div>
            {hasFlavors ? (
              <div className="space-y-2">
                <Label className="text-xs">Stock per Flavor</Label>
                {selectedFlavors.map(f => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground flex-1 truncate">{f.name}</span>
                    <Input
                      type="number" min="0"
                      className="h-8 w-24 shrink-0"
                      value={g.flavorStocks[String(f.id)] ?? ""}
                      onChange={e => update(g.id, { flavorStocks: { ...g.flavorStocks, [String(f.id)]: e.target.value } })}
                      placeholder="0"
                      data-testid={`input-stock-flavor-${f.id}-group-${g.id}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Stock</Label>
                <Input type="number" min="0" value={g.qty} onChange={e => update(g.id, { qty: e.target.value })} placeholder="0" />
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={addGroup} className="w-full">
        <Plus className="w-4 h-4 mr-1" />Add variant group
      </Button>
    </div>
  );
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

// ── Listing Live Preview ──────────────────────────────────────────────────────

function ListingLivePreview({
  product, groups, availableFlavors, availableSizes,
}: {
  product: { imageUrl?: string | null; name: string; description?: string | null } & Record<string, any>;
  groups: VariantGroup[];
  availableFlavors: { id: number; name: string }[];
  availableSizes: { id: number; name: string }[];
}) {
  const previewEntries = useMemo(
    () => groupsToEntries(groups, availableFlavors, availableSizes),
    [groups, availableFlavors, availableSizes],
  );
  const hasVariantData = previewEntries.some(e => parseFloat(e.price) > 0 || parseInt(e.qty) > 0);

  return (
    <div className="lg:sticky lg:top-0">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Live Preview</Label>
      <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
        <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Package className="w-16 h-16 text-muted-foreground opacity-40" />
          )}
        </div>
        <div className="p-4 space-y-2">
          <p className="font-semibold text-lg leading-tight">{product.name}</p>
          {product.description && <p className="text-sm text-muted-foreground line-clamp-3">{product.description}</p>}
          {'categoryLabel' in product && <TaxBadges product={product as ProductWithTaxonomy} />}
          {hasVariantData && (
            <div className="pt-2 border-t space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variants</p>
              {previewEntries.map((e, i) => {
                const label = [e.flavorName, e.sizeName].filter(Boolean).join(" · ") || "Default";
                const price = parseFloat(e.price);
                const qty = parseInt(e.qty) || 0;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">{label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {price > 0 && <span className="font-medium">DT{price.toFixed(2)}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded-md ${qty > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                        {qty > 0 ? `${qty} in stock` : "No stock"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
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

  const [groups, setGroups] = useState<VariantGroup[]>([{ id: "default", sizeId: "", flavorIds: [], price: "", qty: "", flavorStocks: {} }]);

  const add = useMutation({
    mutationFn: async () => {
      const entries = groupsToEntries(groups, availableFlavors, availableSizes);
      const listingRes = await apiRequest("POST", "/api/supplier/listings", {
        productId: product.id,
        price: 0,
        stock: 0,
        availableFlavorIds: availableFlavors.map(f => f.id),
        availableSizeIds: availableSizes.map(s => s.id),
        availableBrandIds: product.brandId ? [product.brandId] : [],
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

  const entries = useMemo(() => groupsToEntries(groups, availableFlavors, availableSizes), [groups, availableFlavors, availableSizes]);
  const hasAnyPrice = entries.some(e => parseFloat(e.price) > 0 && parseInt(e.qty) > 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to My Products — Variant Builder</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          {/* Left – Builder */}
          <div className="space-y-4">
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
              <Label className="mb-2 block">Build custom variant groups (size + flavors + price + stock)</Label>
              <VariantGroupBuilder flavors={availableFlavors} sizes={availableSizes} groups={groups} onChange={setGroups} />
              <p className="text-xs text-muted-foreground mt-1.5">Products only appear in the shop when price &gt; 0 and stock &gt; 0.</p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => add.mutate()} disabled={add.isPending || !hasAnyPrice} data-testid="button-confirm-add-listing">
                {add.isPending ? "Adding…" : "Add to My Products"}
              </Button>
            </div>
          </div>

          {/* Right – Live Preview */}
          <ListingLivePreview
            product={product}
            groups={groups}
            availableFlavors={availableFlavors}
            availableSizes={availableSizes}
          />
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

  const [groups, setGroups] = useState<VariantGroup[]>([{ id: "default", sizeId: "", flavorIds: [], price: "", qty: "", flavorStocks: {} }]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && (existingVariants as any[]).length > 0) {
      setGroups(variantsToGroups(existingVariants as any[], availableFlavors, availableSizes));
      setLoaded(true);
    }
  }, [existingVariants, loaded, availableFlavors, availableSizes]);

  const save = useMutation({
    mutationFn: async () => {
      const entries = groupsToEntries(groups, availableFlavors, availableSizes);
      await apiRequest("POST", `/api/supplier/listings/${listing.id}/variants`, {
        variants: entries.map(e => ({
          flavorId: e.flavorId,
          sizeId: e.sizeId,
          price: parseFloat(e.price) || 0,
          quantity: parseInt(e.qty) || 0,
        })),
      });
    },
    onSuccess: () => { toast({ title: "Variants updated" }); onSuccess(); onClose(); },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Pricing & Stock — Variant Builder</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          {/* Left – Builder */}
          <div className="space-y-4">
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
              <Label className="mb-2 block">Manage variant groups (size + flavors + price + stock per flavor)</Label>
              <VariantGroupBuilder flavors={availableFlavors} sizes={availableSizes} groups={groups} onChange={setGroups} />
              <p className="text-xs text-muted-foreground mt-1.5">Variants with qty 0 will be hidden from café customers.</p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-listing">
                {save.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>

          {/* Right – Live Preview */}
          <ListingLivePreview
            product={listing.product}
            groups={groups}
            availableFlavors={availableFlavors}
            availableSizes={availableSizes}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PENDING: "bg-amber-400 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "Create New Product"}</DialogTitle>
          {!editing && <p className="text-sm text-muted-foreground mt-1">Submitted products go to admin for review and approval.</p>}
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          {/* Left – Form */}
          <div className="space-y-4">
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

          {/* Right – Live Preview */}
          <div className="lg:sticky lg:top-0">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Live Preview</Label>
            <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
              <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <Package className="w-16 h-16 text-muted-foreground opacity-40" />
                )}
              </div>
              <div className="p-4 space-y-2">
                <p className="font-semibold text-lg leading-tight">{form.name || "Product name"}</p>
                {form.description && <p className="text-sm text-muted-foreground line-clamp-3">{form.description}</p>}
                <div className="flex flex-wrap gap-1 pt-1">
                  {form.categoryId && <Badge variant="secondary" className="text-xs">{supplierCats.find(c => String(c.id) === form.categoryId)?.name}</Badge>}
                  {form.subCategoryId && <Badge variant="outline" className="text-xs">{filteredSubs.find(s => String(s.id) === form.subCategoryId)?.name}</Badge>}
                  {form.brandId && <Badge className="text-xs">{filteredBrnds.find(b => String(b.id) === form.brandId)?.name}</Badge>}
                </div>
                {(form.flavorIds.length > 0 || form.sizeIds.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {filteredFlavs.filter(f => form.flavorIds.includes(f.id)).map(f => (
                      <Badge key={f.id} className="text-xs bg-pink-300 text-pink-700 border-0">{f.name}</Badge>
                    ))}
                    {filteredSzs.filter(s => form.sizeIds.includes(s.id)).map(s => (
                      <Badge key={s.id} className="text-xs bg-amber-400 text-amber-700 border-0">{s.name}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tab 3: New Product ────────────────────────────────────────────────────────

type NewProductFilters = { search: string; categoryId: string; subCategoryId: string; flavorId: string; sizeId: string; brandId: string };
const EMPTY_NEW_FILTERS: NewProductFilters = { search: "", categoryId: "", subCategoryId: "", flavorId: "", sizeId: "", brandId: "" };

function NewProductTab({ cats, subs, flavs, szs, brnds, mappings = [] }: {
  cats: CategoryWithCount[]; subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[]; szs: SizeWithCount[]; brnds: BrandWithCount[];
  mappings?: any[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<ProductWithTaxonomy | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState<NewProductFilters>(EMPTY_NEW_FILTERS);

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

  // Stats
  const totalCount = createdProducts.length;
  const pendingCount = (createdProducts as any[]).filter(p => (p as any).status === 'PENDING').length;
  const approvedCount = (createdProducts as any[]).filter(p => (p as any).status === 'ACTIVE').length;

  // Dynamic filter options — cat/subcat aware
  const filteredSubsForFilter = useMemo(() =>
    filters.categoryId ? subs.filter(s => String(s.categoryId) === filters.categoryId) : subs,
    [filters.categoryId, subs]
  );

  const filterTaxNew = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = filters.subCategoryId ? parseInt(filters.subCategoryId) : null;
    const catId = filters.categoryId ? parseInt(filters.categoryId) : null;
    const catSubIds = subs.filter(s => String(s.categoryId) === filters.categoryId).map(s => s.id);
    if (subId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const filteredFlavsNew = useMemo(() => filterTaxNew(flavs), [flavs, filters.categoryId, filters.subCategoryId, subs]);
  const filteredSzsNew = useMemo(() => filterTaxNew(szs), [szs, filters.categoryId, filters.subCategoryId, subs]);
  const filteredBrndsNew = useMemo(() => filterTaxNew(brnds), [brnds, filters.categoryId, filters.subCategoryId, subs]);

  const setFilter = (key: keyof NewProductFilters, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value === "__all__" ? "" : value };
      if (key === "categoryId") { next.subCategoryId = ""; next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      if (key === "subCategoryId") { next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      return next;
    });
  };

  // Client-side filtering
  const displayed = useMemo(() => {
    let list = createdProducts as any[];
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    if (filters.categoryId) list = list.filter(p => String(p.categoryId) === filters.categoryId);
    if (filters.subCategoryId) list = list.filter(p => String(p.subCategoryId) === filters.subCategoryId);
    if (filters.flavorId) list = list.filter(p => p.flavorId === parseInt(filters.flavorId) || p.flavorIds?.includes(parseInt(filters.flavorId)));
    if (filters.sizeId) list = list.filter(p => p.sizeId === parseInt(filters.sizeId) || p.sizeIds?.includes(parseInt(filters.sizeId)));
    if (filters.brandId) list = list.filter(p => String(p.brandId) === filters.brandId);
    return list;
  }, [createdProducts, filters]);

  const hasActiveFilters = Object.values(filters).some(v => v !== "");

  return (
    <div className="space-y-4">
      {/* Stats Strip */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{totalCount} product{totalCount !== 1 ? 's' : ''} created</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{pendingCount} pending review · {approvedCount} approved</span>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-new-product-search"
                className="pl-9"
                placeholder="Search products…"
                value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
              />
            </div>
            {/* Category */}
            <div className="min-w-[150px]">
              <Select value={filters.categoryId} onValueChange={v => setFilter("categoryId", v)}>
                <SelectTrigger data-testid="select-new-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Categories</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* SubCategory */}
            <div className="min-w-[150px]">
              <Select value={filters.subCategoryId} onValueChange={v => setFilter("subCategoryId", v)} disabled={!filters.categoryId}>
                <SelectTrigger data-testid="select-new-filter-subcat"><SelectValue placeholder="Sub-category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sub-categories</SelectItem>
                  {filteredSubsForFilter.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Flavor */}
            <div className="min-w-[130px]">
              <Select value={filters.flavorId} onValueChange={v => setFilter("flavorId", v)}>
                <SelectTrigger data-testid="select-new-filter-flavor"><SelectValue placeholder="Flavor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Flavors</SelectItem>
                  {filteredFlavsNew.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Size */}
            <div className="min-w-[130px]">
              <Select value={filters.sizeId} onValueChange={v => setFilter("sizeId", v)}>
                <SelectTrigger data-testid="select-new-filter-size"><SelectValue placeholder="Size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sizes</SelectItem>
                  {filteredSzsNew.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Brand */}
            <div className="min-w-[130px]">
              <Select value={filters.brandId} onValueChange={v => setFilter("brandId", v)}>
                <SelectTrigger data-testid="select-new-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Brands</SelectItem>
                  {filteredBrndsNew.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Clear */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_NEW_FILTERS)} className="text-muted-foreground">
                <X className="w-4 h-4 mr-1" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Toolbar: action + view toggle */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Submit new products for admin review and approval.</p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="toggle-new-view-list"
              title="List view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="toggle-new-view-grid"
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={() => { setEditingProd(null); setModalOpen(true); }} data-testid="button-create-supplier-product">
            <Plus className="w-4 h-4 mr-1.5" />New Product
          </Button>
        </div>
      </div>

      {/* Product list / grid */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="p-12 flex flex-col items-center gap-3 text-center border rounded-lg bg-secondary/10">
          <Package className="w-10 h-10 text-muted-foreground opacity-40" />
          <div>
            <p className="font-medium">{hasActiveFilters ? "No products match your filters" : "No products created yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters ? "Try adjusting your filters." : "Click \"New Product\" to submit a product for admin approval."}
            </p>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {displayed.map(p => (
            <div key={p.id} className="border rounded-lg overflow-hidden bg-card" data-testid={`card-created-product-${p.id}`}>
              <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground opacity-40" />}
              </div>
              <div className="p-2.5 space-y-1">
                <p className="font-medium text-sm line-clamp-2">{p.name}</p>
                <StatusBadge status={(p as any).status ?? 'PENDING'} />
                <div className="flex gap-1 pt-1">
                  {(p as any).status === 'PENDING' && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => { setEditingProd(p); setModalOpen(true); }} data-testid={`button-edit-sprod-${p.id}`}>
                        <Pencil className="w-3 h-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMut.mutate(p.id); }} data-testid={`button-delete-sprod-grid-${p.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
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
              {displayed.map(p => (
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
  mappings, flavs, szs, brnds, onGoToCategories,
}: {
  mappings: any[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  brnds: BrandWithCount[];
  onGoToCategories: () => void;
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<SimpleFilters>(EMPTY_SIMPLE);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [detailProduct, setDetailProduct] = useState<AdminProductWithListing | null>(null);
  const [addingProduct, setAddingProduct] = useState<AdminProductWithListing | null>(null);

  const { selectedCategoryId, selectedSubCategoryId, setSelectedCategory, setSelectedSubCategory } = useSupplierCategoryStore();

  const hasMappings = mappings.length > 0;

  // Validate stored selection against current mappings ("All Categories" = null is a valid default)
  const validCatId = useMemo(() => {
    if (selectedCategoryId === null) return null;
    return (mappings as any[]).some((m: any) => m.category.id === selectedCategoryId)
      ? selectedCategoryId
      : null;
  }, [selectedCategoryId, mappings]);

  // Mapped cats and subcats for filter dropdowns
  const mappedCats = useMemo(() =>
    (mappings as any[]).map((m: any) => m.category),
    [mappings]
  );
  const mappedSubcats = useMemo(() => {
    if (!validCatId) return [];
    const m = (mappings as any[]).find((m: any) => m.category.id === validCatId);
    return m?.subCategories ?? [];
  }, [mappings, validCatId]);

  // Change category via filter bar → update Zustand store
  const handleCatChange = (v: string) => {
    if (v === "__all__") {
      setSelectedCategory(null);
      setSelectedSubCategory(null);
    } else {
      const id = parseInt(v);
      setSelectedCategory(id);
      setSelectedSubCategory(null);
    }
    setFilters(EMPTY_SIMPLE);
  };

  // Change subcategory via filter bar → update Zustand store
  const handleSubCatChange = (v: string) => {
    setSelectedSubCategory(v === "__all__" ? null : parseInt(v));
    setFilters(prev => ({ ...prev, flavorId: "", sizeId: "", brandId: "" }));
  };

  const setFilter = (key: keyof SimpleFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value === "__all__" ? "" : value }));
  };

  // Dynamic filter options — narrowed by selected cat/subcat
  const filterTaxBySubCat = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = selectedSubCategoryId;
    const catId = validCatId;
    const catSubIds = (mappings as any[])
      .find((m: any) => m.category.id === catId)?.subCategories?.map((s: any) => s.id) ?? [];
    if (subId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const filteredFlavsForFilter = useMemo(() => filterTaxBySubCat(flavs), [flavs, validCatId, selectedSubCategoryId, mappings]);
  const filteredSzsForFilter = useMemo(() => filterTaxBySubCat(szs), [szs, validCatId, selectedSubCategoryId, mappings]);
  const filteredBrndsForFilter = useMemo(() => filterTaxBySubCat(brnds), [brnds, validCatId, selectedSubCategoryId, mappings]);

  // Fetch ALL products for this supplier's mapped categories
  const { data: allAdminProducts = [], isLoading } = useQuery<AdminProductWithListing[]>({
    queryKey: ["/api/supplier/admin-products"],
    queryFn: async () => {
      const res = await fetch("/api/supplier/admin-products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: hasMappings,
  });

  // Narrow by selected category/subcategory (client-side)
  const adminProducts = useMemo(() => {
    if (!validCatId) return allAdminProducts;
    if (selectedSubCategoryId) {
      return (allAdminProducts as any[]).filter((p: any) => p.subCategoryId === selectedSubCategoryId);
    }
    return (allAdminProducts as any[]).filter((p: any) => p.categoryId === validCatId);
  }, [allAdminProducts, validCatId, selectedSubCategoryId]);

  const displayed = useMemo(() => {
    let list = adminProducts as any[];
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter((p: any) => p.name.toLowerCase().includes(q));
    }
    if (filters.flavorId) list = list.filter((p: any) => p.flavorId === parseInt(filters.flavorId) || p.flavorIds?.includes(parseInt(filters.flavorId)));
    if (filters.sizeId) list = list.filter((p: any) => p.sizeId === parseInt(filters.sizeId) || p.sizeIds?.includes(parseInt(filters.sizeId)));
    if (filters.brandId) list = list.filter((p: any) => p.brandId === parseInt(filters.brandId));
    return list;
  }, [adminProducts, filters]);

  // Stats
  const addedCount = (allAdminProducts as any[]).filter(p => p.myListing != null).length;
  const hasActiveFilters = validCatId !== null || selectedSubCategoryId !== null || Object.values(filters).some(v => v !== "");

  const catIdStr = validCatId ? String(validCatId) : "";
  const subCatIdStr = selectedSubCategoryId ? String(selectedSubCategoryId) : "";

  return (
    <div className="space-y-4">
      {/* Stats Strip */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{allAdminProducts.length} products available</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{addedCount} added to my catalog · {mappings.length} categories</span>
        </div>
      </div>

      {!hasMappings ? (
        <NoSelectionEmptyState onGoToCategories={onGoToCategories} />
      ) : (
        <>
          {/* Filter Bar */}
          <Card className="border shadow-none">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    data-testid="input-search-admin-products"
                    className="pl-9"
                    placeholder="Search products…"
                    value={filters.search}
                    onChange={e => setFilter("search", e.target.value)}
                  />
                </div>
                {/* Category */}
                <div className="min-w-[150px]">
                  <Select value={catIdStr || "__all__"} onValueChange={handleCatChange}>
                    <SelectTrigger data-testid="select-admin-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Categories</SelectItem>
                      {mappedCats.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* SubCategory */}
                <div className="min-w-[150px]">
                  <Select value={subCatIdStr || "__all__"} onValueChange={handleSubCatChange} disabled={!catIdStr}>
                    <SelectTrigger data-testid="select-admin-filter-subcat"><SelectValue placeholder="Sub-category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Sub-categories</SelectItem>
                      {mappedSubcats.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Flavor */}
                <div className="min-w-[130px]">
                  <Select value={filters.flavorId || "__all__"} onValueChange={v => setFilter("flavorId", v)}>
                    <SelectTrigger data-testid="select-admin-filter-flavor"><SelectValue placeholder="Flavor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Flavors</SelectItem>
                      {filteredFlavsForFilter.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Size */}
                <div className="min-w-[130px]">
                  <Select value={filters.sizeId || "__all__"} onValueChange={v => setFilter("sizeId", v)}>
                    <SelectTrigger data-testid="select-admin-filter-size"><SelectValue placeholder="Size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Sizes</SelectItem>
                      {filteredSzsForFilter.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Brand */}
                <div className="min-w-[130px]">
                  <Select value={filters.brandId || "__all__"} onValueChange={v => setFilter("brandId", v)}>
                    <SelectTrigger data-testid="select-admin-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Brands</SelectItem>
                      {filteredBrndsForFilter.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* View toggle + Clear */}
                <div className="flex items-center gap-2 ml-auto">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setFilters(EMPTY_SIMPLE);
                      setSelectedCategory(null);
                      setSelectedSubCategory(null);
                    }} className="text-muted-foreground">
                      <X className="w-4 h-4 mr-1" />Clear
                    </Button>
                  )}
                  <div className="flex border rounded-md overflow-hidden">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="toggle-admin-view-list" title="List view"
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="toggle-admin-view-grid" title="Grid view"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products */}
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          ) : displayed.length === 0 ? (
            <div className="p-12 flex flex-col items-center gap-3 text-center border rounded-lg">
              <Package className="w-10 h-10 text-muted-foreground opacity-40" />
              <div>
                <p className="font-medium">No products available</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasActiveFilters ? "Try adjusting your filters." : "No admin products found for your selected category."}
                </p>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayed.map((p: AdminProductWithListing) => (
                <div key={p.id} className="border rounded-lg overflow-hidden bg-card hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDetailProduct(p)} data-testid={`card-admin-product-${p.id}`}>
                  <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground opacity-40" />}
                  </div>
                  <div className="p-2.5 space-y-1.5">
                    <p className="font-medium text-sm line-clamp-2">{p.name}</p>
                    {p.myListing ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Added</span>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={e => { e.stopPropagation(); setAddingProduct(p); }} data-testid={`button-add-to-my-products-${p.id}`}>
                        <Plus className="w-3 h-3 mr-1" />Add to My Products
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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
        </>
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
  mappings, flavs, szs, brnds, onGoToCategories,
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingListing, setEditingListing] = useState<SupplierListingWithProduct | null>(null);

  const { selectedCategoryId, selectedSubCategoryId, setSelectedCategory, setSelectedSubCategory } = useSupplierCategoryStore();

  const hasMappings = mappings.length > 0;

  // Validate stored selection against current mappings ("All Categories" = null is a valid default)
  const validCatId = useMemo(() => {
    if (selectedCategoryId === null) return null;
    return (mappings as any[]).some((m: any) => m.category.id === selectedCategoryId)
      ? selectedCategoryId
      : null;
  }, [selectedCategoryId, mappings]);

  // Mapped cats/subcats for filter dropdowns
  const mappedCats = useMemo(() =>
    (mappings as any[]).map((m: any) => m.category),
    [mappings]
  );
  const mappedSubcats = useMemo(() => {
    if (!validCatId) return [];
    const m = (mappings as any[]).find((m: any) => m.category.id === validCatId);
    return m?.subCategories ?? [];
  }, [mappings, validCatId]);

  // Change category via filter bar → update Zustand store
  const handleCatChange = (v: string) => {
    if (v === "__all__") {
      setSelectedCategory(null);
      setSelectedSubCategory(null);
    } else {
      const id = parseInt(v);
      setSelectedCategory(id);
      setSelectedSubCategory(null);
    }
    setFilters(EMPTY_SIMPLE);
  };

  // Change subcategory via filter bar → update Zustand store
  const handleSubCatChange = (v: string) => {
    setSelectedSubCategory(v === "__all__" ? null : parseInt(v));
    setFilters(prev => ({ ...prev, flavorId: "", sizeId: "", brandId: "" }));
  };

  const setFilter = (key: keyof SimpleFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value === "__all__" ? "" : value }));
  };

  // Dynamic filter options — narrowed by selected cat/subcat
  const filterTaxBySubCat = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = selectedSubCategoryId;
    const catId = validCatId;
    const catSubIds = (mappings as any[])
      .find((m: any) => m.category.id === catId)?.subCategories?.map((s: any) => s.id) ?? [];
    if (subId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const filteredFlavsForFilter = useMemo(() => filterTaxBySubCat(flavs), [flavs, validCatId, selectedSubCategoryId, mappings]);
  const filteredSzsForFilter = useMemo(() => filterTaxBySubCat(szs), [szs, validCatId, selectedSubCategoryId, mappings]);
  const filteredBrndsForFilter = useMemo(() => filterTaxBySubCat(brnds), [brnds, validCatId, selectedSubCategoryId, mappings]);

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

  // Stats
  const inStockCount = listings.filter(l => l.stock > 0).length;
  const outOfStockCount = listings.filter(l => l.stock === 0).length;

  const hasActiveFilters = validCatId !== null || selectedSubCategoryId !== null || Object.values(filters).some(v => v !== "");
  const catIdStr = validCatId ? String(validCatId) : "";
  const subCatIdStr = selectedSubCategoryId ? String(selectedSubCategoryId) : "";

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
      {/* Stats Strip */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{listings.length} product{listings.length !== 1 ? 's' : ''} in my catalog</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{inStockCount} in stock · {outOfStockCount} out of stock</span>
        </div>
      </div>

      {!hasMappings ? (
        <NoSelectionEmptyState onGoToCategories={onGoToCategories} />
      ) : (
        <>
          {/* Filter Bar */}
          <Card className="border shadow-none">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    data-testid="input-search-my-products"
                    className="pl-9"
                    placeholder="Search products…"
                    value={filters.search}
                    onChange={e => setFilter("search", e.target.value)}
                  />
                </div>
                {/* Category */}
                <div className="min-w-[150px]">
                  <Select value={catIdStr || "__all__"} onValueChange={handleCatChange}>
                    <SelectTrigger data-testid="select-my-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Categories</SelectItem>
                      {mappedCats.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* SubCategory */}
                <div className="min-w-[150px]">
                  <Select value={subCatIdStr || "__all__"} onValueChange={handleSubCatChange} disabled={!catIdStr}>
                    <SelectTrigger data-testid="select-my-filter-subcat"><SelectValue placeholder="Sub-category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Sub-categories</SelectItem>
                      {mappedSubcats.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Flavor */}
                <div className="min-w-[130px]">
                  <Select value={filters.flavorId || "__all__"} onValueChange={v => setFilter("flavorId", v)}>
                    <SelectTrigger data-testid="select-my-filter-flavor"><SelectValue placeholder="Flavor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Flavors</SelectItem>
                      {filteredFlavsForFilter.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Size */}
                <div className="min-w-[130px]">
                  <Select value={filters.sizeId || "__all__"} onValueChange={v => setFilter("sizeId", v)}>
                    <SelectTrigger data-testid="select-my-filter-size"><SelectValue placeholder="Size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Sizes</SelectItem>
                      {filteredSzsForFilter.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Brand */}
                <div className="min-w-[130px]">
                  <Select value={filters.brandId || "__all__"} onValueChange={v => setFilter("brandId", v)}>
                    <SelectTrigger data-testid="select-my-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Brands</SelectItem>
                      {filteredBrndsForFilter.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* View toggle + Clear */}
                <div className="flex items-center gap-2 ml-auto">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setFilters(EMPTY_SIMPLE);
                      setSelectedCategory(null);
                      setSelectedSubCategory(null);
                    }} className="text-muted-foreground">
                      <X className="w-4 h-4 mr-1" />Clear
                    </Button>
                  )}
                  <div className="flex border rounded-md overflow-hidden">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="toggle-my-view-list" title="List view"
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      data-testid="toggle-my-view-grid" title="Grid view"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product list/grid */}
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          ) : displayed.length === 0 ? (
            <div className="p-12 flex flex-col items-center gap-3 text-center border rounded-lg">
              <ShoppingBag className="w-10 h-10 text-muted-foreground opacity-40" />
              <div>
                <p className="font-medium">No products in your catalog</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasActiveFilters ? "Try adjusting your filters." : "Go to the Admin Products tab to add products to your catalog."}
                </p>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayed.map(l => (
                <div key={l.id} className="border rounded-lg overflow-hidden bg-card" data-testid={`card-my-listing-${l.id}`}>
                  <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                    {l.product.imageUrl ? <img src={l.product.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground opacity-40" />}
                  </div>
                  <div className="p-2.5 space-y-1">
                    <p className="font-medium text-sm line-clamp-2">{l.product.name}</p>
                    <p className="text-sm font-semibold">{formatCurrency(l.price)}</p>
                    <p className={`text-xs ${l.stock > 0 ? "text-emerald-600" : "text-red-600"}`}>{l.stock > 0 ? `${l.stock} in stock` : "Out of stock"}</p>
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs" onClick={() => setEditingListing(l)} data-testid={`button-edit-listing-${l.id}`}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => { if (confirm(`Remove "${l.product.name}"?`)) removeMutation.mutate(l.id); }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
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
        </>
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

  const activeMappings = useMemo(
    () => (mappings as any[]).filter((m: any) => m.mappingStatus === "APPROVED" && !m.isFrozen),
    [mappings],
  );

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
            mappings={activeMappings}
            flavs={flavs}
            szs={szs}
            brnds={brnds}
            onGoToCategories={handleGoToCategories}
          />
        </TabsContent>

        <TabsContent value="my-products">
          <MyProductsTab
            mappings={activeMappings}
            flavs={flavs}
            szs={szs}
            brnds={brnds}
            onGoToCategories={handleGoToCategories}
          />
        </TabsContent>

        <TabsContent value="new-product">
          <NewProductTab cats={cats} subs={subs} flavs={flavs} szs={szs} brnds={brnds} mappings={activeMappings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
