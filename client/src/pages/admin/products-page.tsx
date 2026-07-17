import { useState, useMemo } from "react";
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
import { Plus, Pencil, Trash2, Package, Search, X, CheckCircle2, Clock, LayoutGrid, LayoutList, Layers, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import type { ProductWithTaxonomy, CategoryWithCount, SubCategoryWithDetails, FlavorWithCount, SizeWithCount, BrandWithCount } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type Filters = {
  search: string;
  categoryId: string;
  subCategoryId: string;
  flavorId: string;
  sizeId: string;
  brandId: string;
};

const EMPTY_FILTERS: Filters = { search: "", categoryId: "", subCategoryId: "", flavorId: "", sizeId: "", brandId: "" };

type ProductForm = {
  name: string;
  description: string;
  imageUrl: string;
  additionalImageUrls: string[];
  categoryId: string;
  subCategoryId: string;
  flavorIds: number[];
  sizeIds: number[];
  brandId: string;
};

const EMPTY_FORM: ProductForm = { name: "", description: "", imageUrl: "", additionalImageUrls: [], categoryId: "", subCategoryId: "", flavorIds: [], sizeIds: [], brandId: "" };

// ── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ open, name, onClose, onConfirm, isPending }: { open: boolean; name: string; onClose: () => void; onConfirm: () => void; isPending: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Delete "{name}"?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This will permanently remove the product and all supplier listings referencing it.</p>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete">
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Taxonomy Badges ──────────────────────────────────────────────────────────

function CardTaxBadges({ product }: { product: ProductWithTaxonomy }) {
  return (
    <div className="flex flex-wrap gap-1">
      {product.categoryLabel && <Badge variant="secondary" className="text-xs">{product.categoryLabel.name}</Badge>}
      {product.subCategoryLabel && <Badge variant="outline" className="text-xs">{product.subCategoryLabel.name}</Badge>}
      {product.brandLabel && <Badge className="text-xs">{product.brandLabel.name}</Badge>}
    </div>
  );
}

function TaxBadges({ product }: { product: ProductWithTaxonomy }) {
  const flavorLabels = product.flavorLabels?.length ? product.flavorLabels : (product.flavorLabel ? [product.flavorLabel] : []);
  const sizeLabels = product.sizeLabels?.length ? product.sizeLabels : (product.sizeLabel ? [product.sizeLabel] : []);
  return (
    <div className="flex flex-wrap gap-1">
      {product.categoryLabel && <Badge variant="secondary" className="text-xs">{product.categoryLabel.name}</Badge>}
      {product.subCategoryLabel && <Badge variant="outline" className="text-xs">{product.subCategoryLabel.name}</Badge>}
      {flavorLabels.map(f => (
        <Badge key={f.id} className="text-xs bg-pink-300 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400 hover:bg-pink-300 border-0">{f.name}</Badge>
      ))}
      {sizeLabels.map(s => (
        <Badge key={s.id} className="text-xs bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 hover:bg-amber-400 border-0">{s.name}</Badge>
      ))}
      {product.brandLabel && <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 hover:bg-green-100 border-0">{product.brandLabel.name}</Badge>}
    </div>
  );
}

// ── Product effective status ──────────────────────────────────────────────────

function computeProductStatus(p: ProductWithTaxonomy): 'active' | 'inactive' {
  if (p.categoryId && !p.categoryLabel) return 'inactive';
  if (p.subCategoryId && !p.subCategoryLabel) return 'inactive';
  if (p.brandId && !p.brandLabel) return 'inactive';
  const hasFlavorIds = (p.flavorIds?.length ?? 0) > 0 || p.flavorId != null;
  const hasFlavorLabels = (p.flavorLabels?.length ?? 0) > 0 || p.flavorLabel != null;
  if (hasFlavorIds && !hasFlavorLabels) return 'inactive';
  const hasSizeIds = (p.sizeIds?.length ?? 0) > 0 || p.sizeId != null;
  const hasSizeLabels = (p.sizeLabels?.length ?? 0) > 0 || p.sizeLabel != null;
  if (hasSizeIds && !hasSizeLabels) return 'inactive';
  return 'active';
}

function ProductStatusBadge({ product }: { product: ProductWithTaxonomy }) {
  const status = computeProductStatus(product);
  if (status === 'inactive') {
    return <Badge className="text-xs bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0">Inactive</Badge>;
  }
  return <Badge className="text-xs bg-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0">Active</Badge>;
}

// ── Multi-select list ─────────────────────────────────────────────────────────

function MultiSelectList({ label, items, selected, onChange, hint }: {
  label: string;
  items: { id: number; name: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  hint?: string;
}) {
  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1 bg-background">
        {items.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">No options available</p>}
        {items.map(item => (
          <label key={item.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-secondary/50 cursor-pointer">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="rounded" />
            <span className="text-sm">{item.name}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.filter(i => selected.includes(i.id)).map(i => (
            <Badge key={i.id} variant="secondary" className="text-xs gap-1">
              {i.name}
              <button onClick={() => toggle(i.id)} className="hover:text-destructive ml-0.5">×</button>
            </Badge>
          ))}
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Product Form Modal ───────────────────────────────────────────────────────

function ProductFormModal({
  open, onClose, editing, cats, subs, flavs, szs, brnds, endpoint = "/api/admin/products",
}: {
  open: boolean;
  onClose: () => void;
  editing: ProductWithTaxonomy | null;
  cats: CategoryWithCount[];
  subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  brnds: BrandWithCount[];
  endpoint?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState<ProductForm>(() => {
    if (editing) {
      const flavorIds = editing.flavorIds?.length
        ? editing.flavorIds
        : (editing.flavorId ? [editing.flavorId] : []);
      const sizeIds = editing.sizeIds?.length
        ? editing.sizeIds
        : (editing.sizeId ? [editing.sizeId] : []);
      return {
        name: editing.name,
        description: editing.description ?? "",
        imageUrl: editing.imageUrl ?? "",
        additionalImageUrls: (editing as any).imageUrls ?? [],
        categoryId: editing.categoryId ? String(editing.categoryId) : "",
        subCategoryId: editing.subCategoryId ? String(editing.subCategoryId) : "",
        flavorIds,
        sizeIds,
        brandId: editing.brandId ? String(editing.brandId) : "",
      };
    }
    return EMPTY_FORM;
  });

  const setField = (key: keyof ProductForm, value: any) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") {
        next.subCategoryId = "";
        next.flavorIds = [];
        next.sizeIds = [];
        next.brandId = "";
      }
      if (key === "subCategoryId") {
        next.flavorIds = [];
        next.sizeIds = [];
        next.brandId = "";
      }
      return next;
    });
  };

  // ── Dynamic filtering using subCategoryIds field ──────────────────────────
  const filteredSubs = useMemo(() =>
    form.categoryId ? subs.filter(s => String(s.categoryId) === form.categoryId) : subs,
    [form.categoryId, subs]
  );

  const filterTaxBySubCat = <T extends { subCategoryIds?: number[] | null }>(items: T[], subId: number | null, catId: number | null, catSubIds: number[]): T[] => {
    if (subId) {
      const withSubCats = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubCats.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubCats = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubCats.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const subId = form.subCategoryId ? parseInt(form.subCategoryId) : null;
  const catId = form.categoryId ? parseInt(form.categoryId) : null;
  const catSubIds = useMemo(() => subs.filter(s => String(s.categoryId) === form.categoryId).map(s => s.id), [subs, form.categoryId]);

  const filteredFlavs = useMemo(() => filterTaxBySubCat(flavs, subId, catId, catSubIds), [flavs, subId, catId, catSubIds]);
  const filteredSzs = useMemo(() => filterTaxBySubCat(szs, subId, catId, catSubIds), [szs, subId, catId, catSubIds]);
  const filteredBrnds = useMemo(() => filterTaxBySubCat(brnds, subId, catId, catSubIds), [brnds, subId, catId, catSubIds]);

  const save = useMutation({
    mutationFn: (data: any) =>
      editing
        ? apiRequest("PATCH", `/api/admin/products/${editing.id}`, data)
        : apiRequest("POST", "/api/admin/products", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      invalidateMarketplace(qc);
      toast({ title: editing ? "Product updated" : "Product created" });
      onClose();
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    // Set flavorId/sizeId to primary (first) value for backward compat
    const flavorId = form.flavorIds[0] ?? null;
    const sizeId = form.sizeIds[0] ?? null;
    const imageUrls = form.additionalImageUrls.filter(u => u.trim());
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      categoryId: form.categoryId || null,
      subCategoryId: form.subCategoryId || null,
      flavorId,
      sizeId,
      brandId: form.brandId || null,
      flavorIds: form.flavorIds.length > 0 ? form.flavorIds : null,
      sizeIds: form.sizeIds.length > 0 ? form.sizeIds : null,
      category: cats.find(c => String(c.id) === form.categoryId)?.name ?? "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "Add Product to Catalog"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Product Name *</Label>
            <Input data-testid="input-prod-name" value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Lavazza Super Crema 1kg" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input data-testid="input-prod-desc" value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Brief description of the product" />
          </div>

          {/* Image URL */}
          <div className="space-y-1.5">
            <Label>Image URL</Label>
            <Input data-testid="input-prod-image" value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} placeholder="https://..." />
          </div>

          {/* Additional Images */}
          <div className="space-y-1.5">
            <Label>Additional Images</Label>
            <div className="space-y-2">
              {form.additionalImageUrls.map((url, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={url}
                    onChange={e => {
                      const updated = [...form.additionalImageUrls];
                      updated[idx] = e.target.value;
                      setField("additionalImageUrls", updated);
                    }}
                    placeholder="https://..."
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 px-2"
                    onClick={() => setField("additionalImageUrls", form.additionalImageUrls.filter((_, i) => i !== idx))}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setField("additionalImageUrls", [...form.additionalImageUrls, ""])}
              >
                <Plus className="w-3.5 h-3.5" /> Add image
              </Button>
            </div>
          </div>

          {/* Category + SubCategory */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={v => setField("categoryId", v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="select-prod-category"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sub-category</Label>
              <Select value={form.subCategoryId} onValueChange={v => setField("subCategoryId", v === "__none__" ? "" : v)} disabled={!form.categoryId}>
                <SelectTrigger data-testid="select-prod-subcat"><SelectValue placeholder={form.categoryId ? "Select…" : "Pick category first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {filteredSubs.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Flavor multiselect */}
          <MultiSelectList
            label="Flavors"
            items={filteredFlavs}
            selected={form.flavorIds}
            onChange={ids => setField("flavorIds", ids)}
            hint={form.subCategoryId ? "Filtered by selected sub-category" : form.categoryId ? "Filtered by selected category" : undefined}
          />

          {/* Size multiselect */}
          <MultiSelectList
            label="Sizes"
            items={filteredSzs}
            selected={form.sizeIds}
            onChange={ids => setField("sizeIds", ids)}
            hint={form.subCategoryId ? "Filtered by selected sub-category" : form.categoryId ? "Filtered by selected category" : undefined}
          />

          {/* Brand (single select) */}
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={form.brandId} onValueChange={v => setField("brandId", v === "__none__" ? "" : v)}>
              <SelectTrigger data-testid="select-prod-brand"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {filteredBrnds.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(form.categoryId || form.subCategoryId) && (
            <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
              Flavor and Size options are filtered by sub-category assignment. Select a sub-category to narrow results further.
            </p>
          )}
          </div>

          <div className="lg:sticky lg:top-0">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Live Preview</Label>
            <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
              <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <Package className="w-16 h-16 text-muted-foreground opacity-40" />
                )}
              </div>
              <div className="p-4 space-y-2">
                <p className="font-semibold text-lg leading-tight">{form.name || "Product name"}</p>
                {form.description && <p className="text-sm text-muted-foreground line-clamp-3">{form.description}</p>}
                <div className="flex flex-wrap gap-1 pt-1">
                  {form.categoryId && <Badge variant="secondary" className="text-xs">{cats.find(c => String(c.id) === form.categoryId)?.name}</Badge>}
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
        <div className="flex gap-2 justify-end pt-4 border-t mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={save.isPending || !form.name.trim()} data-testid="button-save-product">
            {save.isPending ? "Saving…" : editing ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Supplier Product Edit Modal ─────────────────────────────────────────────────

function SupplierProductEditModal({
  product, cats, subs, flavs, szs, brnds, onClose, onSave, isSaving, onApprove, isApproving, onDelete,
}: {
  product: ProductWithTaxonomy & { creatorName?: string; status?: string };
  cats: CategoryWithCount[];
  subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  brnds: BrandWithCount[];
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
  onApprove: () => void;
  isApproving: boolean;
  onDelete: () => void;
}) {
  const { toast } = useToast();

  const [form, setForm] = useState<ProductForm>(() => {
    const flavorIds = product.flavorIds?.length
      ? product.flavorIds
      : (product.flavorId ? [product.flavorId] : []);
    const sizeIds = product.sizeIds?.length
      ? product.sizeIds
      : (product.sizeId ? [product.sizeId] : []);
    return {
      name: product.name,
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
      additionalImageUrls: (product as any).imageUrls ?? [],
      categoryId: product.categoryId ? String(product.categoryId) : "",
      subCategoryId: product.subCategoryId ? String(product.subCategoryId) : "",
      flavorIds,
      sizeIds,
      brandId: product.brandId ? String(product.brandId) : "",
    };
  });

  const setField = (key: keyof ProductForm, value: any) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") {
        next.subCategoryId = "";
        next.flavorIds = [];
        next.sizeIds = [];
        next.brandId = "";
      }
      if (key === "subCategoryId") {
        next.flavorIds = [];
        next.sizeIds = [];
        next.brandId = "";
      }
      return next;
    });
  };

  const filteredSubs = useMemo(() =>
    form.categoryId ? subs.filter(s => String(s.categoryId) === form.categoryId) : subs,
    [form.categoryId, subs]
  );

  const filterTaxBySubCat = <T extends { subCategoryIds?: number[] | null }>(items: T[], subId: number | null, catId: number | null, catSubIds: number[]): T[] => {
    if (subId) {
      const withSubCats = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubCats.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubCats = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubCats.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const subId = form.subCategoryId ? parseInt(form.subCategoryId) : null;
  const catId = form.categoryId ? parseInt(form.categoryId) : null;
  const catSubIds = useMemo(() => subs.filter(s => String(s.categoryId) === form.categoryId).map(s => s.id), [subs, form.categoryId]);

  const filteredFlavs = useMemo(() => filterTaxBySubCat(flavs, subId, catId, catSubIds), [flavs, subId, catId, catSubIds]);
  const filteredSzs = useMemo(() => filterTaxBySubCat(szs, subId, catId, catSubIds), [szs, subId, catId, catSubIds]);
  const filteredBrnds = useMemo(() => filterTaxBySubCat(brnds, subId, catId, catSubIds), [brnds, subId, catId, catSubIds]);

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    const flavorId = form.flavorIds[0] ?? null;
    const sizeId = form.sizeIds[0] ?? null;
    onSave({
      name: form.name.trim(),
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      categoryId: form.categoryId || null,
      subCategoryId: form.subCategoryId || null,
      flavorId,
      sizeId,
      brandId: form.brandId || null,
      flavorIds: form.flavorIds.length > 0 ? form.flavorIds : null,
      sizeIds: form.sizeIds.length > 0 ? form.sizeIds : null,
      category: cats.find(c => String(c.id) === form.categoryId)?.name ?? "",
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Supplier Product</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input data-testid="input-sp-edit-name" value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. Lavazza Super Crema 1kg" />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input data-testid="input-sp-edit-desc" value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Brief description of the product" />
            </div>

            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input data-testid="input-sp-edit-image" value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} placeholder="https://..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={v => setField("categoryId", v === "__none__" ? "" : v)}>
                  <SelectTrigger data-testid="select-sp-edit-category"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sub-category</Label>
                <Select value={form.subCategoryId} onValueChange={v => setField("subCategoryId", v === "__none__" ? "" : v)} disabled={!form.categoryId}>
                  <SelectTrigger data-testid="select-sp-edit-subcat"><SelectValue placeholder={form.categoryId ? "Select…" : "Pick category first"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {filteredSubs.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <MultiSelectList
              label="Flavors"
              items={filteredFlavs}
              selected={form.flavorIds}
              onChange={ids => setField("flavorIds", ids)}
              hint={form.subCategoryId ? "Filtered by selected sub-category" : form.categoryId ? "Filtered by selected category" : undefined}
            />

            <MultiSelectList
              label="Sizes"
              items={filteredSzs}
              selected={form.sizeIds}
              onChange={ids => setField("sizeIds", ids)}
              hint={form.subCategoryId ? "Filtered by selected sub-category" : form.categoryId ? "Filtered by selected category" : undefined}
            />

            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={form.brandId} onValueChange={v => setField("brandId", v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="select-sp-edit-brand"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {filteredBrnds.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(form.categoryId || form.subCategoryId) && (
              <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
                Flavor and Size options are filtered by sub-category assignment. Select a sub-category to narrow results further.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Preview</Label>
              <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <Package className="w-16 h-16 text-muted-foreground opacity-40" />
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <p className="font-semibold text-lg leading-tight">{form.name || "Product name"}</p>
                  {form.description && <p className="text-sm text-muted-foreground line-clamp-3">{form.description}</p>}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {form.categoryId && <Badge variant="secondary" className="text-xs">{cats.find(c => String(c.id) === form.categoryId)?.name}</Badge>}
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

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
              <SpStatusBadge status={product.status ?? ""} />
            </div>
            {product.creatorName && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Submitted by</p>
                <p className="text-sm font-medium">{product.creatorName}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end pt-4 border-t mt-4">
          <Button variant="destructive" onClick={onDelete} data-testid={`button-delete-modal-${product.id}`}>
            <Trash2 className="w-4 h-4 mr-2" />Delete Product
          </Button>
          {product.status !== 'ACTIVE' && (
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onApprove} disabled={isApproving} data-testid={`button-approve-modal-${product.id}`}>
              <CheckCircle2 className="w-4 h-4 mr-2" />{isApproving ? "Approving…" : "Approve Product"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || !form.name.trim()} data-testid="button-save-sp-product">
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Supplier Products Section ──────────────────────────────────────────────────

type SpFilters = {
  search: string;
  categoryId: string;
  subCategoryId: string;
  flavorId: string;
  sizeId: string;
  brandId: string;
};

const EMPTY_SP_FILTERS: SpFilters = { search: "", categoryId: "", subCategoryId: "", flavorId: "", sizeId: "", brandId: "" };

type SupplierProductItem = ProductWithTaxonomy & { creatorName?: string };

function SpStatusBadge({ status }: { status: string }) {
  if (status === 'PENDING') return <Badge className="bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending</Badge>;
  if (status === 'ACTIVE') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === 'REJECTED') return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  return <Badge className="bg-secondary text-muted-foreground border-0 text-xs">Unknown</Badge>;
}

function SupplierProductsSection({
  cats, subs, flavs, szs, brnds,
}: {
  cats: CategoryWithCount[];
  subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  brnds: BrandWithCount[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [spFilters, setSpFilters] = useState<SpFilters>(EMPTY_SP_FILTERS);
  const [selectedProduct, setSelectedProduct] = useState<SupplierProductItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierProductItem | null>(null);

  const { data: supplierProducts = [], isLoading } = useQuery<SupplierProductItem[]>({
    queryKey: ["/api/admin/supplier-products"],
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/supplier-products/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/supplier-products"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      invalidateMarketplace(qc);
      toast({ title: "Product approved" });
      setSelectedProduct(null);
    },
    onError: () => toast({ title: "Error approving", variant: "destructive" }),
  });

  const updateSpMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/supplier-products/${id}`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/supplier-products"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      invalidateMarketplace(qc);
      toast({ title: "Product updated" });
    },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/supplier-products"] });
      toast({ title: "Product deleted" });
      setDeleteTarget(null);
      setSelectedProduct(null);
    },
    onError: () => toast({ title: "Error deleting", variant: "destructive" }),
  });

  // ── Dynamic filter dropdowns ────────────────────────────────────────────────

  const filteredSubsSp = useMemo(() =>
    spFilters.categoryId ? subs.filter(s => String(s.categoryId) === spFilters.categoryId) : subs,
    [spFilters.categoryId, subs]
  );

  const filterTaxSp = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = spFilters.subCategoryId ? parseInt(spFilters.subCategoryId) : null;
    const catId = spFilters.categoryId ? parseInt(spFilters.categoryId) : null;
    const catSubIds = subs.filter(s => String(s.categoryId) === spFilters.categoryId).map(s => s.id);
    if (subId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const filteredFlavsSp = useMemo(() => filterTaxSp(flavs), [flavs, spFilters.categoryId, spFilters.subCategoryId, subs]);
  const filteredSzsSp = useMemo(() => filterTaxSp(szs), [szs, spFilters.categoryId, spFilters.subCategoryId, subs]);
  const filteredBrndsSp = useMemo(() => filterTaxSp(brnds), [brnds, spFilters.categoryId, spFilters.subCategoryId, subs]);

  const setSpFilter = (key: keyof SpFilters, value: string) => {
    setSpFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") { next.subCategoryId = ""; next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      if (key === "subCategoryId") { next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      return next;
    });
  };

  const hasActiveSpFilters = Object.values(spFilters).some(v => v !== "");

  const displayed = useMemo(() => {
    let list = supplierProducts as SupplierProductItem[];
    if (spFilters.search.trim()) {
      const q = spFilters.search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    if (spFilters.categoryId) list = list.filter(p => String(p.categoryId) === spFilters.categoryId);
    if (spFilters.subCategoryId) list = list.filter(p => String(p.subCategoryId) === spFilters.subCategoryId);
    if (spFilters.flavorId) {
      const fid = parseInt(spFilters.flavorId);
      list = list.filter(p => (p.flavorIds ?? []).includes(fid) || p.flavorId === fid);
    }
    if (spFilters.sizeId) {
      const sid = parseInt(spFilters.sizeId);
      list = list.filter(p => (p.sizeIds ?? []).includes(sid) || p.sizeId === sid);
    }
    if (spFilters.brandId) list = list.filter(p => String(p.brandId) === spFilters.brandId);
    return list;
  }, [supplierProducts, spFilters]);

  const pendingCount = supplierProducts.filter(p => (p as any).status === 'PENDING').length;
  const rejectedCount = supplierProducts.filter(p => (p as any).status === 'REJECTED').length;

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{supplierProducts.length} total products</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-muted-foreground">{pendingCount} pending review</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{rejectedCount} rejected</span>
        </div>
      </div>

      {/* Filter bar + view toggle */}
      <div className="flex items-start gap-3">
        <Card className="border shadow-none flex-1">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-sp-search"
                  className="pl-9"
                  placeholder="Search products…"
                  value={spFilters.search}
                  onChange={e => setSpFilter("search", e.target.value)}
                />
              </div>
              <div className="min-w-[150px]">
                <Select value={spFilters.categoryId} onValueChange={v => setSpFilter("categoryId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-sp-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Categories</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[150px]">
                <Select value={spFilters.subCategoryId} onValueChange={v => setSpFilter("subCategoryId", v === "__all__" ? "" : v)} disabled={!spFilters.categoryId}>
                  <SelectTrigger data-testid="select-sp-filter-subcat"><SelectValue placeholder="Sub-category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sub-categories</SelectItem>
                    {filteredSubsSp.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[130px]">
                <Select value={spFilters.flavorId} onValueChange={v => setSpFilter("flavorId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-sp-filter-flavor"><SelectValue placeholder="Flavor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Flavors</SelectItem>
                    {filteredFlavsSp.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[130px]">
                <Select value={spFilters.sizeId} onValueChange={v => setSpFilter("sizeId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-sp-filter-size"><SelectValue placeholder="Size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sizes</SelectItem>
                    {filteredSzsSp.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[130px]">
                <Select value={spFilters.brandId} onValueChange={v => setSpFilter("brandId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-sp-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Brands</SelectItem>
                    {filteredBrndsSp.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveSpFilters && (
                <Button variant="ghost" size="sm" onClick={() => setSpFilters(EMPTY_SP_FILTERS)} className="text-muted-foreground">
                  <X className="w-4 h-4 mr-1" />Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-1 border rounded-lg p-0.5 self-start mt-0 shrink-0">
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid="toggle-sp-view-list" title="List view">
            <LayoutList className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid="toggle-sp-view-grid" title="Grid view">
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
            <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /></div>
          </div>
        ))}</div>
      ) : displayed.length === 0 ? (
        <div className="p-16 flex flex-col items-center gap-3 text-center border rounded-lg">
          <Package className="w-12 h-12 text-muted-foreground opacity-40" />
          <p className="font-medium">{hasActiveSpFilters ? "No products match your filters" : "No supplier products yet"}</p>
          <p className="text-sm text-muted-foreground">
            {hasActiveSpFilters ? "Try adjusting your filters." : "Products created by suppliers will appear here for review."}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {displayed.map(p => (
            <div
              key={p.id}
              className="border rounded-lg overflow-hidden bg-card hover:shadow-sm transition-shadow cursor-pointer"
              data-testid={`card-supplier-product-${p.id}`}
              onClick={() => setSelectedProduct(p)}
            >
              <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-8 h-8 text-muted-foreground opacity-40" />
                )}
              </div>
              <div className="p-2.5 space-y-1.5">
                <p className="font-medium text-sm line-clamp-2 leading-tight">{p.name}</p>
                <CardTaxBadges product={p} />
                <SpStatusBadge status={(p as any).status} />
                <div className="flex gap-1 pt-0.5" onClick={e => e.stopPropagation()}>
                  {(p as any).status !== 'ACTIVE' && (
                    <Button size="sm" className="h-7 px-2 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveMut.mutate(p.id)} disabled={approveMut.isPending} data-testid={`button-approve-sprod-${p.id}`}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)} disabled={deleteMut.isPending} data-testid={`button-delete-sprod-${p.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map(p => (
                <TableRow key={p.id} data-testid={`row-supplier-product-${p.id}`} className="hover:bg-secondary/20 cursor-pointer" onClick={() => setSelectedProduct(p)}>
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
                    {(p as any).creatorName && <p className="text-xs text-muted-foreground mt-0.5">By: {(p as any).creatorName}</p>}
                  </TableCell>
                  <TableCell><TaxBadges product={p} /></TableCell>
                  <TableCell><SpStatusBadge status={(p as any).status} /></TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      {(p as any).status !== 'ACTIVE' && (
                        <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveMut.mutate(p.id)} disabled={approveMut.isPending} data-testid={`button-approve-sprod-${p.id}`}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" className="text-xs" onClick={() => setDeleteTarget(p)} disabled={deleteMut.isPending} data-testid={`button-delete-sprod-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Product Detail / Edit Modal */}
      {selectedProduct && (
        <SupplierProductEditModal
          product={selectedProduct}
          cats={cats}
          subs={subs}
          flavs={flavs}
          szs={szs}
          brnds={brnds}
          onClose={() => setSelectedProduct(null)}
          onSave={(data) => updateSpMut.mutate({ id: selectedProduct.id, data })}
          isSaving={updateSpMut.isPending}
          onApprove={() => approveMut.mutate(selectedProduct.id)}
          isApproving={approveMut.isPending}
          onDelete={() => { setSelectedProduct(null); setDeleteTarget(selectedProduct); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          open
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  );
}

// ── Admin Packs Section ───────────────────────────────────────────────────────

// ── Pack status badge ─────────────────────────────────────────────────────────

function PackStatusBadge({ pack }: { pack: any }) {
  if (pack.isArchived) return <Badge className="text-xs border-0 bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Archived</Badge>;
  if (pack.isExpired) return <Badge className="text-xs border-0 bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">Expired</Badge>;
  if (pack.visibility === "HIDDEN") return <Badge className="text-xs border-0 bg-secondary text-muted-foreground">Hidden</Badge>;
  if (pack.isAvailable) return <Badge className="text-xs border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Available</Badge>;
  return <Badge className="text-xs border-0 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Out of Stock</Badge>;
}

// ── Admin Pack Preview Modal ──────────────────────────────────────────────────

function AdminPackPreviewModal({
  pack,
  onClose,
  onToggleVisibility,
  onDelete,
  isPending,
}: {
  pack: any;
  onClose: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const individualTotal = (pack.items ?? []).reduce((s: number, i: any) => s + (i.unitPrice ?? 0) * (i.quantity ?? 1), 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-500" />
            Pack Preview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Hero image */}
          <div className="relative aspect-[16/9] bg-secondary rounded-xl overflow-hidden">
            {pack.imageUrl ? (
              <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Layers className="w-16 h-16 text-muted-foreground opacity-20" />
              </div>
            )}
            {/* Expiry badge */}
            {pack.expirationDate && (
              <div className="absolute bottom-3 right-3">
                <Badge className="bg-orange-500 text-white border-0 text-xs">
                  Exp. {new Date(pack.expirationDate).toLocaleDateString()}
                </Badge>
              </div>
            )}
          </div>

          {/* Header info */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <h2 className="font-bold text-xl leading-tight">{pack.name}</h2>
                {pack.description && <p className="text-sm text-muted-foreground">{pack.description}</p>}
                <p className="text-sm text-muted-foreground font-medium">{pack.supplierName ?? "—"}</p>
              </div>
              <PackStatusBadge pack={pack} />
            </div>

            {/* Taxonomy badges */}
            <div className="flex flex-wrap gap-1.5">
              {(pack.categoryLabels ?? []).map((c: any) => (
                <Badge key={c.id} variant="secondary" className="text-xs">{c.name}</Badge>
              ))}
              {(pack.subCategoryLabels ?? []).map((c: any) => (
                <Badge key={c.id} variant="outline" className="text-xs">{c.name}</Badge>
              ))}
              {(pack.brandLabels ?? []).map((b: any) => (
                <Badge key={b.id} className="text-xs bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-0">{b.name}</Badge>
              ))}
            </div>
          </div>

          {/* Price + stock row */}
          <div className="flex flex-wrap gap-4 p-3 bg-secondary/40 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Pack Price</p>
              <p className="font-bold text-lg text-amber-600">
                {pack.price != null ? `${(pack.price / 100).toFixed(2)} TND` : "—"}
              </p>
              {individualTotal > (pack.price ?? 0) && (
                <p className="text-xs text-muted-foreground line-through">
                  {(individualTotal / 100).toFixed(2)} TND (individual)
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Max Buildable</p>
              <p className="font-semibold">{pack.maxBuildable ?? 0}</p>
            </div>
            {pack.packReviewCount > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Rating</p>
                <p className="font-semibold">{pack.packAvgRating?.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">({pack.packReviewCount} reviews)</span></p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Visibility</p>
              <p className="font-semibold text-sm">{pack.visibility === "VISIBLE" ? "Visible" : "Hidden"}</p>
            </div>
          </div>

          {/* Items list */}
          {(pack.items ?? []).length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">{(pack.items ?? []).length} items included</p>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs">Variant</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Unit Price</TableHead>
                      <TableHead className="text-xs text-right">Pack Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pack.items ?? []).map((item: any) => (
                      <TableRow key={item.id} className="hover:bg-secondary/20">
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            {item.productImageUrl ? (
                              <img src={item.productImageUrl} alt="" className="w-8 h-8 rounded object-cover border border-border/50 shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <p className="text-xs font-medium line-clamp-2">{item.productName}</p>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.flavorName && <Badge className="text-[10px] px-1 py-0 bg-pink-100 text-pink-700 border-0">{item.flavorName}</Badge>}
                            {item.sizeName && <Badge className="text-[10px] px-1 py-0 bg-amber-100 text-amber-700 border-0">{item.sizeName}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs">×{item.quantity}</TableCell>
                        <TableCell className="py-2 text-right text-xs text-muted-foreground">
                          {item.unitPrice != null ? `${(item.unitPrice / 100).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs font-medium">
                          {item.packVariantPrice != null ? `${(item.packVariantPrice / 100).toFixed(2)} TND` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Admin actions */}
          <div className="flex items-center justify-between pt-2 border-t gap-3 flex-wrap">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleVisibility}
                disabled={isPending}
                data-testid={`button-modal-toggle-visibility-pack-${pack.id}`}
              >
                {pack.visibility === "VISIBLE" ? (
                  <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Hide Pack</>
                ) : (
                  <><Eye className="w-3.5 h-3.5 mr-1.5" />Show Pack</>
                )}
              </Button>
            </div>
            {!confirmDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                data-testid={`button-modal-delete-pack-${pack.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete Pack
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Are you sure?</span>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  disabled={isPending}
                  data-testid="button-modal-confirm-delete-pack"
                >
                  {isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pack Filters type ─────────────────────────────────────────────────────────

type PackFilters = {
  search: string;
  categoryId: string;
  subCategoryId: string;
  brandId: string;
  flavorId: string;
  sizeId: string;
  status: string; // "" | "available" | "unavailable" | "hidden" | "archived" | "expired"
};

const EMPTY_PACK_FILTERS: PackFilters = {
  search: "", categoryId: "", subCategoryId: "", brandId: "", flavorId: "", sizeId: "", status: "",
};

// ── Admin Packs Section ───────────────────────────────────────────────────────

function AdminPacksSection({
  cats, subs, flavs, szs, brnds,
}: {
  cats: CategoryWithCount[];
  subs: SubCategoryWithDetails[];
  flavs: FlavorWithCount[];
  szs: SizeWithCount[];
  brnds: BrandWithCount[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [packFilters, setPackFilters] = useState<PackFilters>(EMPTY_PACK_FILTERS);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewPack, setPreviewPack] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);

  const { data: packs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/packs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/packs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) =>
      apiRequest("PATCH", `/api/admin/packs/${id}`, data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/packs"] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/packs"] });
      toast({ title: "Pack updated" });
      // Refresh the pack in preview if it's open
      if (previewPack?.id === variables.id) {
        setPreviewPack((prev: any) => prev ? { ...prev, ...variables.data } : prev);
      }
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/packs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/packs"] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace/packs"] });
      toast({ title: "Pack deleted" });
      setDeleting(null);
      setPreviewPack(null);
    },
    onError: () => toast({ title: "Error deleting pack", variant: "destructive" }),
  });

  // ── Dynamic filter dropdowns ──────────────────────────────────────────────

  const filteredSubsPack = useMemo(() =>
    packFilters.categoryId ? subs.filter(s => String(s.categoryId) === packFilters.categoryId) : subs,
    [packFilters.categoryId, subs]
  );

  const filterTaxPack = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = packFilters.subCategoryId ? parseInt(packFilters.subCategoryId) : null;
    const catSubIds = subs.filter(s => String(s.categoryId) === packFilters.categoryId).map(s => s.id);
    if (subId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (packFilters.categoryId) {
      const withSubs = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubs.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some((sid: number) => catSubIds.includes(sid)));
    }
    return items;
  };

  const filteredFlavsPack = useMemo(() => filterTaxPack(flavs), [flavs, packFilters.categoryId, packFilters.subCategoryId, subs]);
  const filteredSzsPack = useMemo(() => filterTaxPack(szs), [szs, packFilters.categoryId, packFilters.subCategoryId, subs]);
  const filteredBrndsPack = useMemo(() => filterTaxPack(brnds), [brnds, packFilters.categoryId, packFilters.subCategoryId, subs]);

  const setPackFilter = (key: keyof PackFilters, value: string) => {
    setPackFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") { next.subCategoryId = ""; next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      if (key === "subCategoryId") { next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      return next;
    });
  };

  const hasActivePackFilters = Object.values(packFilters).some(v => v !== "");

  // ── Client-side filtering ─────────────────────────────────────────────────

  const displayed = useMemo(() => {
    let list = packs as any[];
    if (packFilters.search.trim()) {
      const q = packFilters.search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.supplierName ?? "").toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    if (packFilters.categoryId) {
      const cid = parseInt(packFilters.categoryId);
      list = list.filter(p => (p.categoryIds ?? []).includes(cid));
    }
    if (packFilters.subCategoryId) {
      const sid = parseInt(packFilters.subCategoryId);
      list = list.filter(p => (p.subCategoryIds ?? []).includes(sid));
    }
    if (packFilters.brandId) {
      const bid = parseInt(packFilters.brandId);
      list = list.filter(p => (p.brandIds ?? []).includes(bid));
    }
    if (packFilters.flavorId) {
      const fid = parseInt(packFilters.flavorId);
      list = list.filter(p => (p.items ?? []).some((i: any) => i.flavorId === fid));
    }
    if (packFilters.sizeId) {
      const sid = parseInt(packFilters.sizeId);
      list = list.filter(p => (p.items ?? []).some((i: any) => i.sizeId === sid));
    }
    if (packFilters.status) {
      if (packFilters.status === "available") list = list.filter(p => p.isAvailable);
      else if (packFilters.status === "unavailable") list = list.filter(p => !p.isAvailable && !p.isArchived && !p.isExpired && p.visibility === "VISIBLE");
      else if (packFilters.status === "hidden") list = list.filter(p => p.visibility === "HIDDEN");
      else if (packFilters.status === "archived") list = list.filter(p => p.isArchived);
      else if (packFilters.status === "expired") list = list.filter(p => p.isExpired);
    }
    return list;
  }, [packs, packFilters]);

  const toggleVisibility = (pack: any) => {
    const newVisibility = pack.visibility === "VISIBLE" ? "HIDDEN" : "VISIBLE";
    patchMutation.mutate({ id: pack.id, data: { visibility: newVisibility } });
    // Optimistically update preview
    if (previewPack?.id === pack.id) setPreviewPack((prev: any) => prev ? { ...prev, visibility: newVisibility } : prev);
  };

  const openPreview = (pack: any) => {
    // Always use the latest data from the query
    const latest = packs.find((p: any) => p.id === pack.id) ?? pack;
    setPreviewPack(latest);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium">{packs.length} total packs</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {packs.filter((p: any) => p.isAvailable).length} available ·{" "}
            {packs.filter((p: any) => !p.isAvailable).length} unavailable
          </span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {packs.filter((p: any) => p.isArchived).length} archived ·{" "}
            {packs.filter((p: any) => p.isExpired && !p.isArchived).length} expired
          </span>
        </div>
      </div>

      {/* Filter bar + view toggle */}
      <div className="flex items-start gap-3">
        <Card className="border shadow-none flex-1">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search packs or suppliers…"
                  value={packFilters.search}
                  onChange={e => setPackFilter("search", e.target.value)}
                  data-testid="input-pack-search"
                />
              </div>

              {/* Category */}
              <div className="min-w-[150px]">
                <Select value={packFilters.categoryId} onValueChange={v => setPackFilter("categoryId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-pack-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Categories</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-category */}
              <div className="min-w-[150px]">
                <Select value={packFilters.subCategoryId} onValueChange={v => setPackFilter("subCategoryId", v === "__all__" ? "" : v)} disabled={!packFilters.categoryId}>
                  <SelectTrigger data-testid="select-pack-filter-subcat"><SelectValue placeholder="Sub-category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sub-categories</SelectItem>
                    {filteredSubsPack.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand */}
              <div className="min-w-[130px]">
                <Select value={packFilters.brandId} onValueChange={v => setPackFilter("brandId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-pack-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Brands</SelectItem>
                    {filteredBrndsPack.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Flavor */}
              <div className="min-w-[130px]">
                <Select value={packFilters.flavorId} onValueChange={v => setPackFilter("flavorId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-pack-filter-flavor"><SelectValue placeholder="Flavor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Flavors</SelectItem>
                    {filteredFlavsPack.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Size */}
              <div className="min-w-[130px]">
                <Select value={packFilters.sizeId} onValueChange={v => setPackFilter("sizeId", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-pack-filter-size"><SelectValue placeholder="Size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sizes</SelectItem>
                    {filteredSzsPack.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="min-w-[130px]">
                <Select value={packFilters.status} onValueChange={v => setPackFilter("status", v === "__all__" ? "" : v)}>
                  <SelectTrigger data-testid="select-pack-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Statuses</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="unavailable">Out of Stock</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear */}
              {hasActivePackFilters && (
                <Button variant="ghost" size="sm" onClick={() => setPackFilters(EMPTY_PACK_FILTERS)} className="text-muted-foreground">
                  <X className="w-4 h-4 mr-1" />Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Grid / List toggle */}
        <div className="flex gap-1 border rounded-lg p-0.5 self-start mt-0">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="toggle-pack-view-list"
            title="List view"
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="toggle-pack-view-grid"
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-secondary/30 rounded-lg animate-pulse" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Layers className="w-12 h-12 text-muted-foreground opacity-40 mb-4" />
          <p className="font-semibold">{hasActivePackFilters ? "No packs match your filters" : "No packs found"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasActivePackFilters ? "Try adjusting your filters." : "Suppliers can create packs from their Pack tab."}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid ──────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {displayed.map((pack: any) => (
            <div
              key={pack.id}
              className="border rounded-lg overflow-hidden bg-card hover:shadow-sm transition-shadow cursor-pointer"
              data-testid={`card-pack-${pack.id}`}
              onClick={() => openPreview(pack)}
            >
              <div className="relative aspect-square bg-amber-50 flex items-center justify-center overflow-hidden">
                {pack.imageUrl ? (
                  <img src={pack.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Layers className="w-8 h-8 text-amber-300" />
                )}
                {/* Visibility badge */}
                {pack.visibility === "HIDDEN" && (
                  <div className="absolute top-1.5 right-1.5">
                    <Badge className="text-[10px] px-1.5 py-0 bg-secondary text-muted-foreground border-0">Hidden</Badge>
                  </div>
                )}
              </div>
              <div className="p-2.5 space-y-1.5">
                <p className="font-medium text-sm line-clamp-2 leading-tight">{pack.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{pack.supplierName ?? "—"}</p>
                <div className="flex flex-wrap gap-1">
                  {(pack.categoryLabels ?? []).slice(0, 2).map((c: any) => (
                    <Badge key={c.id} variant="secondary" className="text-[10px] px-1.5 py-0">{c.name}</Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <PackStatusBadge pack={pack} />
                  <span className="text-xs font-medium text-amber-600">
                    {pack.price != null ? `${(pack.price / 100).toFixed(2)}` : "—"}
                  </span>
                </div>
                {/* Quick actions */}
                <div className="flex gap-1 pt-0.5" onClick={e => e.stopPropagation()}>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 px-2 text-xs flex-1"
                    title={pack.visibility === "VISIBLE" ? "Hide" : "Show"}
                    onClick={() => toggleVisibility(pack)}
                    disabled={patchMutation.isPending}
                    data-testid={`button-toggle-visibility-pack-${pack.id}`}
                  >
                    {pack.visibility === "VISIBLE" ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    {pack.visibility === "VISIBLE" ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => setDeleting({ id: pack.id, name: pack.name })}
                    data-testid={`button-delete-pack-${pack.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── List ──────────────────────────────────────────────────────────── */
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14" />
                <TableHead>Pack</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((pack: any) => (
                <TableRow
                  key={pack.id}
                  data-testid={`row-pack-${pack.id}`}
                  className="hover:bg-secondary/20 cursor-pointer"
                  onClick={() => openPreview(pack)}
                >
                  <TableCell className="p-3">
                    {pack.imageUrl ? (
                      <img src={pack.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-border/50" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-amber-300" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{pack.name}</p>
                    {pack.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{pack.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(pack.items ?? []).length} item{(pack.items ?? []).length !== 1 ? "s" : ""} included
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{pack.supplierName ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(pack.categoryLabels ?? []).slice(0, 2).map((c: any) => (
                        <Badge key={c.id} variant="secondary" className="text-xs">{c.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {pack.price != null ? `${(pack.price / 100).toFixed(2)} TND` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pack.maxBuildable ?? 0}
                  </TableCell>
                  <TableCell><PackStatusBadge pack={pack} /></TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon" variant="ghost" className="h-8 w-8"
                        title={pack.visibility === "VISIBLE" ? "Hide pack" : "Show pack"}
                        onClick={() => toggleVisibility(pack)}
                        disabled={patchMutation.isPending}
                        data-testid={`button-toggle-visibility-pack-${pack.id}`}
                      >
                        {pack.visibility === "VISIBLE" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting({ id: pack.id, name: pack.name })}
                        data-testid={`button-delete-pack-${pack.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pack Preview Modal */}
      {previewPack && (
        <AdminPackPreviewModal
          pack={packs.find((p: any) => p.id === previewPack.id) ?? previewPack}
          onClose={() => setPreviewPack(null)}
          onToggleVisibility={() => toggleVisibility(packs.find((p: any) => p.id === previewPack.id) ?? previewPack)}
          onDelete={() => deleteMutation.mutate(previewPack.id)}
          isPending={patchMutation.isPending || deleteMutation.isPending}
        />
      )}

      {/* Standalone delete confirm (from quick-action buttons) */}
      {deleting && (
        <DeleteConfirm
          open
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminProductsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [section, setSection] = useState<'catalog' | 'supplier' | 'packs'>('catalog');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithTaxonomy | null>(null);
  const [deleting, setDeleting] = useState<ProductWithTaxonomy | null>(null);

  const params = new URLSearchParams();
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.subCategoryId) params.set("subCategoryId", filters.subCategoryId);
  if (filters.flavorId) params.set("flavorId", filters.flavorId);
  if (filters.sizeId) params.set("sizeId", filters.sizeId);
  if (filters.brandId) params.set("brandId", filters.brandId);

  const { data: products = [], isLoading } = useQuery<ProductWithTaxonomy[]>({
    queryKey: ["/api/admin/products", filters.categoryId, filters.subCategoryId, filters.flavorId, filters.sizeId, filters.brandId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/products?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: allProducts = [] } = useQuery<ProductWithTaxonomy[]>({
    queryKey: ["/api/admin/products"],
    queryFn: async () => {
      const res = await fetch("/api/admin/products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: cats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: subs = [] } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });
  const { data: flavs = [] } = useQuery<FlavorWithCount[]>({ queryKey: ["/api/flavors"] });
  const { data: szs = [] } = useQuery<SizeWithCount[]>({ queryKey: ["/api/sizes"] });
  const { data: brnds = [] } = useQuery<BrandWithCount[]>({ queryKey: ["/api/brands"] });

  // Dynamic filter dropdowns — client-side derivation using subCategoryIds
  const filteredSubsForFilter = useMemo(() =>
    filters.categoryId ? subs.filter(s => String(s.categoryId) === filters.categoryId) : subs,
    [filters.categoryId, subs]
  );

  const filterTax = <T extends { subCategoryIds?: number[] | null }>(items: T[]): T[] => {
    const subId = filters.subCategoryId ? parseInt(filters.subCategoryId) : null;
    const catId = filters.categoryId ? parseInt(filters.categoryId) : null;
    const catSubIds = subs.filter(s => String(s.categoryId) === filters.categoryId).map(s => s.id);
    if (subId) {
      const withSubCats = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubCats.length > 0) return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    } else if (catId) {
      const withSubCats = items.filter(i => (i.subCategoryIds ?? []).length > 0);
      if (withSubCats.length > 0) return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  };

  const filteredFlavsForFilter = useMemo(() => filterTax(flavs), [flavs, filters.categoryId, filters.subCategoryId, subs]);
  const filteredSzsForFilter = useMemo(() => filterTax(szs), [szs, filters.categoryId, filters.subCategoryId, subs]);
  const filteredBrndsForFilter = useMemo(() => filterTax(brnds), [brnds, filters.categoryId, filters.subCategoryId, subs]);

  // Client-side search
  const displayed = useMemo(() => {
    if (!filters.search.trim()) return products;
    const q = filters.search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, filters.search]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "categoryId") { next.subCategoryId = ""; next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      if (key === "subCategoryId") { next.flavorId = ""; next.sizeId = ""; next.brandId = ""; }
      return next;
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== "");

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      invalidateMarketplace(qc);
      toast({ title: "Product deleted" });
      setDeleting(null);
    },
    onError: () => toast({ title: "Error deleting product", variant: "destructive" }),
  });

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p: ProductWithTaxonomy) => { setEditing(p); setModalOpen(true); };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Admin-managed product catalog. Suppliers browse and claim products from here.
          </p>
        </div>
        {section === 'catalog' && (
          <Button onClick={openAdd} data-testid="button-add-product">
            <Plus className="w-4 h-4 mr-1.5" />Add Product
          </Button>
        )}
      </div>

      {/* Section + View switcher */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
          <button
            onClick={() => setSection('catalog')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${section === 'catalog' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="section-catalog"
          >
            Product Management
          </button>
          <button
            onClick={() => setSection('supplier')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${section === 'supplier' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="section-supplier"
          >
            Supplier Products
          </button>
          <button
            onClick={() => setSection('packs')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${section === 'packs' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="section-packs"
          >
            <Layers className="w-3.5 h-3.5" />Packs
          </button>
        </div>
        {section === 'catalog' && (
          <div className="flex gap-1 border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="toggle-view-list"
              title="List view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid="toggle-view-grid"
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {section === 'supplier' && <SupplierProductsSection cats={cats} subs={subs} flavs={flavs} szs={szs} brnds={brnds} />}

      {section === 'packs' && <AdminPacksSection cats={cats} subs={subs} flavs={flavs} szs={szs} brnds={brnds} />}

      {section === 'catalog' && <>
      {/* Stats strip */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{allProducts.length} total products</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{allProducts.filter(p => computeProductStatus(p) === 'active').length} active · {allProducts.filter(p => computeProductStatus(p) === 'inactive').length} inactive</span>
        </div>
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{cats.length} categories · {subs.length} sub-categories · {flavs.length} flavors · {szs.length} sizes · {brnds.length} brands</span>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="border shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-product-search"
                className="pl-9"
                placeholder="Search products…"
                value={filters.search}
                onChange={e => setFilter("search", e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="min-w-[150px]">
              <Select value={filters.categoryId} onValueChange={v => setFilter("categoryId", v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="select-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Categories</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* SubCategory */}
            <div className="min-w-[150px]">
              <Select value={filters.subCategoryId} onValueChange={v => setFilter("subCategoryId", v === "__all__" ? "" : v)} disabled={!filters.categoryId}>
                <SelectTrigger data-testid="select-filter-subcat"><SelectValue placeholder="Sub-category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sub-categories</SelectItem>
                  {filteredSubsForFilter.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Flavor — dynamic based on subcat */}
            <div className="min-w-[130px]">
              <Select value={filters.flavorId} onValueChange={v => setFilter("flavorId", v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="select-filter-flavor"><SelectValue placeholder="Flavor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Flavors</SelectItem>
                  {filteredFlavsForFilter.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Size — dynamic based on subcat */}
            <div className="min-w-[130px]">
              <Select value={filters.sizeId} onValueChange={v => setFilter("sizeId", v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="select-filter-size"><SelectValue placeholder="Size" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sizes</SelectItem>
                  {filteredSzsForFilter.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Brand — dynamic based on subcat */}
            <div className="min-w-[130px]">
              <Select value={filters.brandId} onValueChange={v => setFilter("brandId", v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="select-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Brands</SelectItem>
                  {filteredBrndsForFilter.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Clear */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)} className="text-muted-foreground">
                <X className="w-4 h-4 mr-1" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Product list or grid */}
      {isLoading ? (
        <div className="space-y-0 border rounded-lg overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b">
              <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /></div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="p-16 flex flex-col items-center gap-3 text-center border rounded-lg">
          <Package className="w-12 h-12 text-muted-foreground opacity-40" />
          <div>
            <p className="font-medium">No products found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters ? "Try adjusting your filters." : "Add your first product to the catalog."}
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {displayed.map(p => (
            <div key={p.id} className="border rounded-lg overflow-hidden bg-card hover:shadow-sm transition-shadow" data-testid={`card-product-${p.id}`}>
              <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-8 h-8 text-muted-foreground opacity-40" />
                )}
              </div>
              <div className="p-2.5 space-y-1.5">
                <p className="font-medium text-sm line-clamp-2 leading-tight">{p.name}</p>
                <CardTaxBadges product={p} />
                <ProductStatusBadge product={p} />
                <div className="flex gap-1 pt-0.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs flex-1" onClick={() => openEdit(p)} data-testid={`button-edit-product-${p.id}`}>
                    <Pencil className="w-3 h-3 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleting(p)} data-testid={`button-delete-product-${p.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
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
                <TableHead>Name</TableHead>
                <TableHead>Taxonomy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map(p => (
                <TableRow key={p.id} data-testid={`row-product-${p.id}`} className="hover:bg-secondary/20">
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
                  <TableCell><ProductStatusBadge product={p} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)} data-testid={`button-edit-product-${p.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(p)} data-testid={`button-delete-product-${p.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ProductFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          editing={editing}
          cats={cats}
          subs={subs}
          flavs={flavs}
          szs={szs}
          brnds={brnds}
        />
      )}

      {deleting && (
        <DeleteConfirm
          open
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          isPending={deleteMutation.isPending}
        />
      )}
      </>}
    </div>
  );
}
