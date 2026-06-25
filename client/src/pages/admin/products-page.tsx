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
import { Plus, Pencil, Trash2, Package, Search, X, CheckCircle2, Clock, LayoutGrid, LayoutList } from "lucide-react";
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
  categoryId: string;
  subCategoryId: string;
  flavorIds: number[];
  sizeIds: number[];
  brandId: string;
};

const EMPTY_FORM: ProductForm = { name: "", description: "", imageUrl: "", categoryId: "", subCategoryId: "", flavorIds: [], sizeIds: [], brandId: "" };

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

function TaxBadges({ product }: { product: ProductWithTaxonomy }) {
  const flavorLabels = product.flavorLabels?.length ? product.flavorLabels : (product.flavorLabel ? [product.flavorLabel] : []);
  const sizeLabels = product.sizeLabels?.length ? product.sizeLabels : (product.sizeLabel ? [product.sizeLabel] : []);
  return (
    <div className="flex flex-wrap gap-1">
      {product.categoryLabel && <Badge variant="secondary" className="text-xs">{product.categoryLabel.name}</Badge>}
      {product.subCategoryLabel && <Badge variant="outline" className="text-xs">{product.subCategoryLabel.name}</Badge>}
      {flavorLabels.map(f => (
        <Badge key={f.id} className="text-xs bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400 hover:bg-pink-100 border-0">{f.name}</Badge>
      ))}
      {sizeLabels.map(s => (
        <Badge key={s.id} className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 hover:bg-amber-100 border-0">{s.name}</Badge>
      ))}
      {product.brandLabel && <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 hover:bg-green-100 border-0">{product.brandLabel.name}</Badge>}
    </div>
  );
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
    save.mutate({
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Product" : "Add Product to Catalog"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
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

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={save.isPending || !form.name.trim()} data-testid="button-save-product">
              {save.isPending ? "Saving…" : editing ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Supplier Products Section ──────────────────────────────────────────────────

function SupplierProductsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: supplierProducts = [], isLoading } = useQuery<ProductWithTaxonomy[]>({
    queryKey: ["/api/admin/supplier-products"],
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/supplier-products/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/supplier-products"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/products"] });
      invalidateMarketplace(qc);
      toast({ title: "Product approved" });
    },
    onError: () => toast({ title: "Error approving", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/supplier-products"] });
      toast({ title: "Product deleted" });
    },
    onError: () => toast({ title: "Error deleting", variant: "destructive" }),
  });

  const pendingCount = (supplierProducts as any[]).filter(p => (p as any).status === 'PENDING').length;

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">{pendingCount} supplier product(s) awaiting review</p>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
            <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /></div>
          </div>
        ))}</div>
      ) : supplierProducts.length === 0 ? (
        <div className="p-16 flex flex-col items-center gap-3 text-center border rounded-lg">
          <Package className="w-12 h-12 text-muted-foreground opacity-40" />
          <p className="font-medium">No supplier products yet</p>
          <p className="text-sm text-muted-foreground">Products created by suppliers will appear here for review.</p>
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
              {(supplierProducts as any[]).map(p => (
                <TableRow key={p.id} data-testid={`row-supplier-product-${p.id}`} className="hover:bg-secondary/20">
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
                  <TableCell>
                    {p.status === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending</Badge>}
                    {p.status === 'ACTIVE' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>}
                    {p.status === 'REJECTED' && <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>}
                    {!p.status && <Badge className="bg-secondary text-muted-foreground border-0 text-xs">Unknown</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.status === 'PENDING' && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveMut.mutate(p.id)} disabled={approveMut.isPending} data-testid={`button-approve-sprod-${p.id}`}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="text-xs" onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMut.mutate(p.id); }} data-testid={`button-delete-sprod-${p.id}`}>
                          <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminProductsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [section, setSection] = useState<'catalog' | 'supplier'>('catalog');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
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

      {section === 'supplier' && <SupplierProductsSection />}

      {section === 'catalog' && <>
      {/* Stats strip */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-2 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{allProducts.length} total products</span>
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
                <TaxBadges product={p} />
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
