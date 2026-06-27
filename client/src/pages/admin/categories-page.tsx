import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Folder, Tag, Ruler, Award, Layers, ToggleLeft, ToggleRight, Search, CheckCircle, XCircle, Clock, Building2, ChevronDown, ChevronUp, Snowflake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CategoryWithCount, SubCategoryWithDetails, FlavorWithCount, SizeWithCount, BrandWithCount, CatalogSuggestion, AdminSupplierCategoryOverview, SupplierCategoryMapping } from "@shared/schema";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}
    >
      {active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
      {active ? "Active" : "Inactive"}
    </button>
  );
}

function DeleteConfirm({ open, onClose, onConfirm, name, warning }: { open: boolean; onClose: () => void; onConfirm: () => void; name: string; warning?: string }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Delete "{name}"?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
        {warning && <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">{warning}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} data-testid="button-confirm-delete">Delete Anyway</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MultiSelectList({ label, items, selected, onChange, badgeItems }: { label: string; items: { id: number; name: string }[]; selected: number[]; onChange: (ids: number[]) => void; badgeItems?: { id: number; name: string }[] }) {
  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };
  const badgeSource = badgeItems ?? items;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1 bg-background">
        {items.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">None available</p>}
        {items.map(item => (
          <label key={item.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-secondary/50 cursor-pointer">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="rounded" />
            <span className="text-sm">{item.name}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {badgeSource.filter(i => selected.includes(i.id)).map(i => (
            <Badge key={i.id} variant="secondary" className="text-xs gap-1">
              {i.name}
              <button onClick={() => toggle(i.id)} className="hover:text-destructive ml-0.5">×</button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CATEGORIES TAB ────────────────────────────────────────────────────────────

function CategoriesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryWithCount | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithCount | null>(null);
  const [form, setForm] = useState({ name: "", icon: "", description: "", isActive: true });

  const { data: cats = [], isLoading } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });

  const invalidateCats = () => {
    qc.invalidateQueries({ queryKey: ["/api/categories"] });
  };

  const isDuplicate = (name: string) =>
    cats.some(c => c.name.toLowerCase() === name.toLowerCase().trim() && c.id !== editing?.id);

  const upsert = useMutation({
    mutationFn: (data: any) =>
      editing
        ? apiRequest("PATCH", `/api/categories/${editing.id}`, data)
        : apiRequest("POST", "/api/categories", data),
    onSuccess: () => {
      invalidateCats();
      toast({ title: editing ? "Category updated" : "Category created" });
      setDialogOpen(false); setEditing(null); setForm({ name: "", icon: "", description: "", isActive: true });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/categories/${id}`, { isActive }),
    onSuccess: () => invalidateCats(),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: () => { invalidateCats(); toast({ title: "Deleted" }); setDeleting(null); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const openAdd = () => { setEditing(null); setForm({ name: "", icon: "", description: "", isActive: true }); setDialogOpen(true); };
  const openEdit = (c: CategoryWithCount) => { setEditing(c); setForm({ name: c.name, icon: c.icon ?? "", description: c.description ?? "", isActive: c.isActive }); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (isDuplicate(form.name)) return toast({ title: "A category with this name already exists", variant: "destructive" });
    upsert.mutate(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{cats.length} categories defined</p>
        <Button size="sm" onClick={openAdd} data-testid="button-add-category"><Plus className="w-4 h-4 mr-1.5" />Add Category</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Sub-cats</TableHead>
                <TableHead className="text-center">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cats.map(c => (
                <TableRow key={c.id} data-testid={`row-category-${c.id}`} className={!c.isActive ? "opacity-60" : ""}>
                  <TableCell className="text-xl">{c.icon || <Folder className="w-5 h-5 text-muted-foreground" />}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{c.description || "—"}</TableCell>
                  <TableCell className="text-center"><Badge variant="secondary">{c.subCategoryCount}</Badge></TableCell>
                  <TableCell className="text-center"><Badge variant="outline">{c.productCount}</Badge></TableCell>
                  <TableCell>
                    <ActiveToggle active={c.isActive} onChange={v => toggleActive.mutate({ id: c.id, isActive: v })} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.createdBy || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`button-edit-cat-${c.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(c)} data-testid={`button-delete-cat-${c.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {cats.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No categories yet. Add one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label>Icon (emoji)</Label>
                <Input data-testid="input-cat-icon" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="☕" className="text-center text-lg" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Name *</Label>
                <Input data-testid="input-cat-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Coffee Beans" />
                {isDuplicate(form.name) && form.name && <p className="text-xs text-destructive">Name already exists</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input data-testid="input-cat-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <ActiveToggle active={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || isDuplicate(form.name) || upsert.isPending} data-testid="button-save-category">
                {upsert.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {deleting && (
        <DeleteConfirm
          open
          onClose={() => setDeleting(null)}
          name={deleting.name}
          warning={deleting.subCategoryCount > 0 || deleting.productCount > 0
            ? `This category has ${deleting.subCategoryCount} sub-categories and ${deleting.productCount} products linked. Deleting it will remove all related data.`
            : undefined}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

// ── SUBCATEGORIES TAB ─────────────────────────────────────────────────────────

function SubCategoriesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategoryWithDetails | null>(null);
  const [deleting, setDeleting] = useState<SubCategoryWithDetails | null>(null);
  const [form, setForm] = useState({ name: "", categoryId: "", description: "", icon: "", isActive: true });
  const [filterCat, setFilterCat] = useState("all");

  const { data: subs = [], isLoading } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });
  const { data: cats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });

  const filtered = filterCat === "all" ? subs : subs.filter(s => String(s.categoryId) === filterCat);

  const isDuplicate = (name: string) =>
    subs.some(s => s.name.toLowerCase() === name.toLowerCase().trim() && String(s.categoryId) === form.categoryId && s.id !== editing?.id);

  const invalidateSubs = () => {
    qc.invalidateQueries({ queryKey: ["/api/subcategories"] });
    qc.invalidateQueries({ queryKey: ["/api/categories"] });
  };

  const upsert = useMutation({
    mutationFn: (data: any) =>
      editing
        ? apiRequest("PATCH", `/api/subcategories/${editing.id}`, { ...data, categoryId: parseInt(data.categoryId) })
        : apiRequest("POST", "/api/subcategories", { ...data, categoryId: parseInt(data.categoryId) }),
    onSuccess: () => {
      invalidateSubs();
      toast({ title: editing ? "Updated" : "Created" });
      setDialogOpen(false); setEditing(null); setForm({ name: "", categoryId: "", description: "", icon: "", isActive: true });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/subcategories/${id}`, { isActive }),
    onSuccess: () => invalidateSubs(),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/subcategories/${id}`),
    onSuccess: () => { invalidateSubs(); toast({ title: "Deleted" }); setDeleting(null); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const openAdd = () => { setEditing(null); setForm({ name: "", categoryId: cats[0] ? String(cats[0].id) : "", description: "", icon: "", isActive: true }); setDialogOpen(true); };
  const openEdit = (s: SubCategoryWithDetails) => {
    setEditing(s);
    setForm({ name: s.name, categoryId: String(s.categoryId), description: s.description ?? "", icon: (s as any).icon ?? "", isActive: s.isActive });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (!form.categoryId) return toast({ title: "Category is required", variant: "destructive" });
    if (isDuplicate(form.name)) return toast({ title: "This sub-category name already exists in this category", variant: "destructive" });
    upsert.mutate(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{subs.length} sub-categories</p>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-8 w-44 text-sm" data-testid="select-filter-cat">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openAdd} data-testid="button-add-subcat"><Plus className="w-4 h-4 mr-1.5" />Add Sub-category</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Parent Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id} data-testid={`row-subcat-${s.id}`} className={!s.isActive ? "opacity-60" : ""}>
                  <TableCell className="text-xl">
                    {(s as any).icon ? <span>{(s as any).icon}</span> : <Layers className="w-4 h-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1">
                      {cats.find(c => c.id === s.categoryId)?.icon} {s.categoryName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{s.description || "—"}</TableCell>
                  <TableCell>
                    <ActiveToggle active={s.isActive} onChange={v => toggleActive.mutate({ id: s.id, isActive: v })} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.createdBy || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)} data-testid={`button-edit-subcat-${s.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(s)} data-testid={`button-delete-subcat-${s.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No sub-categories found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Sub-category" : "New Sub-category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label>Parent Category *</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger data-testid="select-subcat-parent"><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label>Icon (emoji)</Label>
                <Input data-testid="input-subcat-icon" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="🗂" className="text-center text-lg" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Name *</Label>
                <Input data-testid="input-subcat-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Arabica Beans" />
                {isDuplicate(form.name) && form.name && <p className="text-xs text-destructive">Name already exists in this category</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input data-testid="input-subcat-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <ActiveToggle active={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || !form.categoryId || isDuplicate(form.name) || upsert.isPending} data-testid="button-save-subcat">
                {upsert.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {deleting && <DeleteConfirm open onClose={() => setDeleting(null)} name={deleting.name} onConfirm={() => remove.mutate(deleting.id)} />}
    </div>
  );
}

// ── TAXONOMY CRUD TAB (Flavor / Size / Brand) ─────────────────────────────────

type TaxItem = (FlavorWithCount | SizeWithCount | BrandWithCount) & { icon?: string | null; subCategoryIds?: number[] | null; subCategoryNames?: string[] };

function TaxonomyCrudTab({
  title, icon: Icon, apiPath, queryKey, testPrefix, extraFields, cats, subs,
}: {
  title: string;
  icon: any;
  apiPath: string;
  queryKey: string;
  testPrefix: string;
  extraFields?: Array<{ key: string; label: string; placeholder?: string; hint?: string }>;
  cats: CategoryWithCount[];
  subs: SubCategoryWithDetails[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxItem | null>(null);
  const [deleting, setDeleting] = useState<TaxItem | null>(null);
  const [filterSubCatId, setFilterSubCatId] = useState("all");
  const [filterCatId, setFilterCatId] = useState("all");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIcon, setFormIcon] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formSubCategoryIds, setFormSubCategoryIds] = useState<number[]>([]);

  const { data: items = [], isLoading } = useQuery<TaxItem[]>({ queryKey: [queryKey] });

  // Subcategories available in modal based on formCategoryId
  const modalSubs = useMemo(() =>
    formCategoryId ? subs.filter(s => String(s.categoryId) === formCategoryId) : subs,
    [formCategoryId, subs]
  );

  // Table filter: subcategories to show in filter picklist
  const filterSubs = useMemo(() =>
    filterCatId !== "all" ? subs.filter(s => String(s.categoryId) === filterCatId) : subs,
    [filterCatId, subs]
  );

  // Table filter: items filtered by subcategory
  const filteredItems = useMemo(() => {
    if (filterSubCatId !== "all") {
      const subId = parseInt(filterSubCatId);
      return items.filter(i => (i.subCategoryIds ?? []).includes(subId));
    }
    if (filterCatId !== "all") {
      const catSubIds = subs.filter(s => String(s.categoryId) === filterCatId).map(s => s.id);
      return items.filter(i => (i.subCategoryIds ?? []).some(sid => catSubIds.includes(sid)));
    }
    return items;
  }, [items, filterSubCatId, filterCatId, subs]);

  const isDuplicate = (name: string) =>
    items.some(i => i.name.toLowerCase() === name.toLowerCase().trim() && i.id !== editing?.id);

  const invalidateTaxonomy = () => {
    qc.invalidateQueries({ queryKey: [queryKey] });
  };

  const upsert = useMutation({
    mutationFn: (data: any) =>
      editing ? apiRequest("PATCH", `${apiPath}/${editing.id}`, data) : apiRequest("POST", apiPath, data),
    onSuccess: () => {
      invalidateTaxonomy();
      toast({ title: editing ? "Updated" : "Created" });
      setDialogOpen(false); setEditing(null); resetForm();
    },
    onError: (err: any) => toast({ title: err?.message ?? "Error", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `${apiPath}/${id}`, { isActive }),
    onSuccess: () => invalidateTaxonomy(),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${apiPath}/${id}`),
    onSuccess: () => { invalidateTaxonomy(); toast({ title: "Deleted" }); setDeleting(null); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const resetForm = () => {
    setFormName(""); setFormDescription(""); setFormIcon(""); setFormValue("");
    setFormIsActive(true); setFormCategoryId(""); setFormSubCategoryIds([]);
  };

  const openAdd = () => {
    setEditing(null); resetForm(); setDialogOpen(true);
  };

  const openEdit = (item: TaxItem) => {
    setEditing(item);
    setFormName(item.name);
    setFormDescription((item as any).description ?? "");
    setFormIcon(item.icon ?? "");
    setFormValue((item as any).value ?? "");
    setFormIsActive(item.isActive);
    setFormSubCategoryIds(item.subCategoryIds ?? []);
    // Derive category from subcategories
    const firstSubId = (item.subCategoryIds ?? [])[0];
    if (firstSubId) {
      const sub = subs.find(s => s.id === firstSubId);
      setFormCategoryId(sub ? String(sub.categoryId) : "");
    } else {
      setFormCategoryId("");
    }
    setDialogOpen(true);
  };

  const handleCategoryChange = (catId: string) => {
    setFormCategoryId(catId);
    // Category selector only filters the visible subcategory list — do NOT remove previously selected subcategories
  };

  const handleSave = () => {
    const name = formName.trim();
    if (!name) return toast({ title: "Name is required", variant: "destructive" });
    if (isDuplicate(name)) return toast({ title: `A ${title.toLowerCase()} with this name already exists`, variant: "destructive" });
    const payload: any = {
      name,
      description: formDescription.trim() || null,
      icon: formIcon.trim() || null,
      subCategoryIds: formSubCategoryIds.length > 0 ? formSubCategoryIds : null,
      isActive: formIsActive,
    };
    if (extraFields?.some(f => f.key === "value")) {
      payload.value = formValue.trim() || null;
    }
    upsert.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {/* Table header with filter */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{items.length} {title.toLowerCase()}s defined</p>
          <Select value={filterCatId} onValueChange={v => { setFilterCatId(v); setFilterSubCatId("all"); }}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSubCatId} onValueChange={setFilterSubCatId} disabled={filterCatId === "all" && filterSubs.length === 0}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder="All sub-cats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sub-cats</SelectItem>
              {filterSubs.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openAdd} data-testid={`button-add-${testPrefix}`}><Plus className="w-4 h-4 mr-1.5" />Add {title}</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icon</TableHead>
                <TableHead>Name</TableHead>
                {extraFields?.map(f => <TableHead key={f.key}>{f.label}</TableHead>)}
                <TableHead>Sub-categories</TableHead>
                <TableHead className="text-center">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(item => (
                <TableRow key={item.id} data-testid={`row-${testPrefix}-${item.id}`} className={!item.isActive ? "opacity-60" : ""}>
                  <TableCell className="text-xl">
                    {item.icon ? <span>{item.icon}</span> : <Icon className="w-4 h-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  {extraFields?.map(f => (
                    <TableCell key={f.key} className="text-sm text-muted-foreground">
                      {(item as any)[f.key] || "—"}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(item.subCategoryNames ?? []).length > 0
                        ? item.subCategoryNames!.map((n, i) => <Badge key={i} variant="outline" className="text-xs">{n}</Badge>)
                        : <span className="text-xs text-muted-foreground">—</span>
                      }
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><Badge variant="outline">{item.productCount}</Badge></TableCell>
                  <TableCell>
                    <ActiveToggle active={item.isActive} onChange={v => toggleActive.mutate({ id: item.id, isActive: v })} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.createdBy || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} data-testid={`button-edit-${testPrefix}-${item.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(item)} data-testid={`button-delete-${testPrefix}-${item.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredItems.length === 0 && (
                <TableRow><TableCell colSpan={7 + (extraFields?.length ?? 0)} className="text-center py-8 text-muted-foreground">
                  {items.length === 0 ? `No ${title.toLowerCase()}s yet.` : "No results match the selected filter."}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditing(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Edit ${title}` : `New ${title}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Category picklist */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={formCategoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger data-testid={`select-${testPrefix}-category`}><SelectValue placeholder="Select a category (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* SubCategory multiselect */}
            <MultiSelectList
              label="Sub-categories"
              items={formCategoryId && formCategoryId !== "__none__" ? modalSubs : subs}
              selected={formSubCategoryIds}
              onChange={setFormSubCategoryIds}
              badgeItems={subs}
            />

            {/* Icon + Name row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Icon (emoji)</Label>
                <Input
                  data-testid={`input-${testPrefix}-icon`}
                  value={formIcon}
                  onChange={e => setFormIcon(e.target.value)}
                  placeholder="🍵"
                  className="text-center text-lg"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Name *</Label>
                <Input
                  data-testid={`input-${testPrefix}-name`}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={`e.g. ${title === "Flavor" ? "Vanilla" : title === "Size" ? "Large" : "Lavazza"}`}
                />
                {isDuplicate(formName) && formName && <p className="text-xs text-destructive">Name already exists</p>}
              </div>
            </div>

            {/* Extra fields (description / value) */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                data-testid={`input-${testPrefix}-description`}
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Brief description"
              />
            </div>
            {extraFields?.filter(f => f.key === "value").map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  data-testid={`input-${testPrefix}-${f.key}`}
                  value={formValue}
                  onChange={e => setFormValue(e.target.value)}
                  placeholder={f.placeholder}
                />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            ))}

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <ActiveToggle active={formIsActive} onChange={setFormIsActive} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={!formName.trim() || isDuplicate(formName) || upsert.isPending} data-testid={`button-save-${testPrefix}`}>
                {upsert.isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {deleting && <DeleteConfirm open onClose={() => setDeleting(null)} name={deleting.name} onConfirm={() => remove.mutate(deleting.id)} />}
    </div>
  );
}

// ── CATEGORY REQUESTS SECTION (inlined) ──────────────────────────────────────

const CAT_ROLES = ["SUPPLIER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE", "DELIVERY_COMPANY"];
const ROLE_LABELS: Record<string, string> = {
  SUPPLIER: "Fournisseur", PRINTER: "Imprimerie", MARKETING: "Marketing",
  BARISTA_ACADEMY: "Barista Academy", BARISTA_MARKETPLACE: "Barista Marketplace",
  CAFE_OWNER: "Café", DELIVERY_COMPANY: "Livraison",
};

interface UserRowLocal {
  id: number; name: string; email: string; role: string; status: string;
  categories?: string[]; printCategories?: string[]; marketingCategories?: string[]; governorates?: string[];
}

function getUserCategories(u: UserRowLocal): string[] {
  if (u.role === "PRINTER") return u.printCategories ?? [];
  if (u.role === "MARKETING") return u.marketingCategories ?? [];
  if (u.role === "DELIVERY_COMPANY") return u.governorates ?? [];
  return u.categories ?? [];
}

const PRESET_CATS_BY_ROLE: Record<string, string[]> = {
  SUPPLIER: ["Café & Grains","Lait & Alternatives","Sirops & Arômes","Équipements","Gobelets & Emballages","Sucre & Condiments","Thé & Infusions","Snacks & Pâtisseries"],
  PRINTER: ["Flyers","Menus","Cartes de visite","Affiches","Enseignes","Packaging","Étiquettes","Banderoles","Gobelets","Kakémonos"],
  MARKETING: ["Réseaux sociaux","Vidéo","Photographie","SEO","Publicité","Branding","Site web","Influence","Email marketing","Événementiel"],
  BARISTA_ACADEMY: ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"],
  BARISTA_MARKETPLACE: ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"],
};

function getRoleBadgeColor(role: string) {
  const map: Record<string, string> = {
    SUPPLIER: "bg-blue-100 text-blue-700", PRINTER: "bg-orange-100 text-orange-700",
    MARKETING: "bg-purple-100 text-purple-700", BARISTA_ACADEMY: "bg-emerald-100 text-emerald-700",
    BARISTA_MARKETPLACE: "bg-indigo-100 text-indigo-700", CAFE_OWNER: "bg-amber-100 text-amber-700",
    DELIVERY_COMPANY: "bg-teal-100 text-teal-700",
  };
  return map[role] ?? "bg-secondary text-secondary-foreground";
}

function CategoryEditModalInline({ user, open, onClose, supplierCatIds }: { user: UserRowLocal; open: boolean; onClose: () => void; supplierCatIds?: number[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: catalogCats = [] } = useQuery<CategoryWithCount[]>({
    queryKey: ["/api/categories"],
    enabled: user.role === 'SUPPLIER',
  });

  const presets = PRESET_CATS_BY_ROLE[user.role] ?? [];
  const current = getUserCategories(user);
  const [selected, setSelected] = useState<string[]>(current);
  const [selectedCatIds, setSelectedCatIds] = useState<number[]>(supplierCatIds ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (cat: string) => setSelected(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const toggleCatId = (id: number) => setSelectedCatIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  const save = async () => {
    setSaving(true);
    try {
      if (user.role === 'SUPPLIER') {
        await apiRequest("PATCH", `/api/admin/supplier-mappings/${user.id}`, { categoryIds: selectedCatIds });
        await qc.invalidateQueries({ queryKey: ["/api/admin/supplier-mappings"] });
      } else {
        const payload: any = {};
        if (user.role === "PRINTER") payload.printCategories = selected;
        else if (user.role === "MARKETING") payload.marketingCategories = selected;
        else payload.categories = selected;
        await apiRequest("PATCH", `/api/admin/users/${user.id}/categories`, payload);
        await qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      }
      toast({ title: "Catégories mises à jour" });
      onClose();
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4" />Modifier les catégories — {user.name}</DialogTitle></DialogHeader>
        <div className="mt-3 space-y-4">
          {user.role === 'SUPPLIER' ? (
            <>
              <p className="text-xs text-muted-foreground">Sélectionnez les catégories du catalogue à assigner à ce fournisseur.</p>
              <div className="flex flex-wrap gap-2">
                {catalogCats.length === 0 && <p className="text-sm text-muted-foreground">Aucune catégorie dans le catalogue.</p>}
                {catalogCats.map(cat => (
                  <button key={cat.id} type="button" onClick={() => toggleCatId(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${selectedCatIds.includes(cat.id) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border/40 hover:border-primary/40"}`}>
                    {cat.icon && <span>{cat.icon}</span>}
                    {cat.name}
                  </button>
                ))}
              </div>
              {selectedCatIds.length > 0 && <p className="text-xs text-muted-foreground">{selectedCatIds.length} catégorie(s) sélectionnée(s)</p>}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {presets.map(cat => (
                  <button key={cat} type="button" onClick={() => toggle(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selected.includes(cat) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border/40 hover:border-primary/40"}`}>
                    {cat}
                  </button>
                ))}
              </div>
              {selected.length > 0 && <p className="text-xs text-muted-foreground">{selected.length} catégorie(s) : {selected.join(", ")}</p>}
            </>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving}>{saving ? "Sauvegarde..." : "Sauvegarder"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupplierCategoryOverviewPanel({ supplierId }: { supplierId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: overview, isLoading, isError, error, refetch } = useQuery<AdminSupplierCategoryOverview>({
    queryKey: ["/api/admin/supplier-mappings", supplierId, "overview"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/supplier-mappings/${supplierId}/overview`, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `Failed to load overview (${res.status})`);
      }
      return res.json();
    },
    retry: 1,
  });

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["/api/admin/supplier-mappings"] }),
      qc.refetchQueries({ queryKey: ["/api/admin/supplier-mappings", supplierId, "overview"] }),
      qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] }),
      qc.invalidateQueries({ queryKey: ["/api/supplier/admin-products"] }),
    ]);
    invalidateMarketplace(qc);
  };

  const approve = useMutation({
    mutationFn: (categoryId: number) => apiRequest("PATCH", `/api/admin/supplier-mappings/${supplierId}/categories/${categoryId}/approve`, {}),
    onSuccess: () => { invalidate(); toast({ title: "Category approved for supplier" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const addToSupplier = useMutation({
    mutationFn: (categoryId: number) => apiRequest("POST", `/api/admin/supplier-mappings/${supplierId}/categories/${categoryId}`, {}),
    onSuccess: () => { invalidate(); toast({ title: "Category added to supplier" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const freeze = useMutation({
    mutationFn: ({ categoryId, isFrozen }: { categoryId: number; isFrozen: boolean }) =>
      apiRequest("PATCH", `/api/admin/supplier-mappings/${supplierId}/categories/${categoryId}/freeze`, { isFrozen }),
    onSuccess: () => { invalidate(); toast({ title: "Category freeze status updated" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (categoryId: number) => apiRequest("DELETE", `/api/admin/supplier-mappings/${supplierId}/categories/${categoryId}`),
    onSuccess: () => { invalidate(); toast({ title: "Category removed from supplier" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-4 bg-secondary/10 border-t">
        <Skeleton className="h-32 w-full" />
        <p className="text-xs text-muted-foreground mt-2">Loading category mappings…</p>
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="p-4 bg-secondary/10 border-t space-y-2">
        <p className="text-sm text-destructive font-medium">Could not load category mappings for this supplier.</p>
        <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const renderRow = (m: SupplierCategoryMapping, actions: ReactNode) => (
    <div key={m.category.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${m.isFrozen ? "border-muted-foreground/40 bg-muted/30" : m.mappingStatus === "APPROVED" ? "border-emerald-300 dark:border-emerald-800" : "border-red-300 dark:border-red-800"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">{m.category.icon || "📦"}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{m.category.name}</p>
          <p className="text-xs text-muted-foreground">{m.selectedSubCategoryIds.length} sub-categories selected</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );

  return (
    <div className="p-4 bg-secondary/10 space-y-4 border-t">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">A. Approved Categories</p>
        {overview.approved.filter(m => m.mappingStatus === "APPROVED").length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">No approved categories.</p>
        ) : overview.approved.filter(m => m.mappingStatus === "APPROVED").map(m => renderRow(m, (
          <>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => freeze.mutate({ categoryId: m.category.id, isFrozen: !m.isFrozen })} disabled={freeze.isPending}>
              <Snowflake className="w-3 h-3 mr-1" />{m.isFrozen ? "Unfreeze" : "Freeze Category"}
            </Button>
            <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => remove.mutate(m.category.id)} disabled={remove.isPending}>Remove from Supplier</Button>
          </>
        )))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">B. Pending Supplier Categories</p>
        {overview.pending.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">No pending category requests.</p>
        ) : overview.pending.map(m => renderRow(m, (
          <Button size="sm" className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700" onClick={() => approve.mutate(m.category.id)} disabled={approve.isPending}>
            <CheckCircle className="w-3 h-3 mr-1" />Approve
          </Button>
        )))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">C. Not Yet Added Categories</p>
        {overview.notAdded.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">All active categories are assigned.</p>
        ) : overview.notAdded.slice(0, 12).map(cat => (
          <div key={cat.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed">
            <div className="flex items-center gap-2"><span>{cat.icon || "📦"}</span><span className="text-sm">{cat.name}</span></div>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => addToSupplier.mutate(cat.id)} disabled={addToSupplier.isPending}>Add to Supplier</Button>
          </div>
        ))}
        {overview.notAdded.length > 12 && <p className="text-xs text-muted-foreground">+{overview.notAdded.length - 12} more categories</p>}
      </div>
    </div>
  );
}

function getSupplierMappingCounts(
  supplierId: number,
  entries: { user?: { id: number }; mappings?: SupplierCategoryMapping[] }[],
): { approvedCount: number; pendingCount: number; frozenCount: number } {
  const entry = entries.find((e) => Number(e.user?.id) === supplierId);
  const mappings = (entry?.mappings ?? []) as SupplierCategoryMapping[];
  return {
    approvedCount: mappings.filter((m) => m.mappingStatus === "APPROVED" && !m.isFrozen).length,
    pendingCount: mappings.filter((m) => m.mappingStatus === "PENDING").length,
    frozenCount: mappings.filter((m) => m.isFrozen).length,
  };
}

function CategoryRequestsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [expandedSupplierId, setExpandedSupplierId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<UserRowLocal | null>(null);
  const [editUserCatIds, setEditUserCatIds] = useState<number[]>([]);
  const didAutoExpand = useRef(false);

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<UserRowLocal[]>({ queryKey: ["/api/admin/users"] });
  const { data: supplierMappingEntries = [], isLoading: mappingsLoading } = useQuery<{ user: any; mappings: SupplierCategoryMapping[] }[]>({
    queryKey: ["/api/admin/supplier-mappings"],
  });

  const isLoading = usersLoading || mappingsLoading;

  const getDisplayCategories = (u: UserRowLocal): string[] => {
    if (u.role === 'SUPPLIER') {
      const entry = (supplierMappingEntries as any[]).find((e: any) => Number(e.user?.id) === Number(u.id));
      if (entry?.mappings?.length > 0) {
        return entry.mappings.map((m: any) => m.category?.name ?? '').filter(Boolean);
      }
      return [];
    }
    return getUserCategories(u);
  };

  const getSupplierCatIds = (u: UserRowLocal): number[] => {
    const entry = (supplierMappingEntries as any[]).find((e: any) => Number(e.user?.id) === Number(u.id));
    return entry?.mappings?.map((m: any) => m.category?.id).filter(Boolean) ?? [];
  };

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/users/${id}/approve`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Approuvé" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/users/${id}/reject`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Rejeté" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const usersToShow = useMemo(() => allUsers.filter(u => {
    if (!CAT_ROLES.includes(u.role)) return false;
    if (u.role === 'SUPPLIER') return true;
    return getUserCategories(u).length > 0;
  }), [allUsers]);

  let filtered = usersToShow;
  if (roleFilter !== "all") filtered = filtered.filter(u => u.role === roleFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  const pendingCount = usersToShow.filter(u => u.status === "pending").length;

  useEffect(() => {
    if (didAutoExpand.current || mappingsLoading) return;
    didAutoExpand.current = true;
    const firstWithPending = usersToShow.find((u) => {
      if (u.role !== "SUPPLIER") return false;
      return getSupplierMappingCounts(Number(u.id), supplierMappingEntries).pendingCount > 0;
    });
    if (firstWithPending) {
      setExpandedSupplierId(Number(firstWithPending.id));
    }
  }, [mappingsLoading, supplierMappingEntries, usersToShow]);

  const toggleSupplierExpand = (supplierId: number) => {
    setExpandedSupplierId((prev) => (prev === supplierId ? null : supplierId));
  };

  const openEdit = (u: UserRowLocal) => {
    setEditUser(u);
    if (u.role === 'SUPPLIER') setEditUserCatIds(getSupplierCatIds(u));
  };

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">{pendingCount} prestataire(s) en attente d'approbation</p>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {CAT_ROLES.map(role => {
          const count = usersToShow.filter(u => u.role === role).length;
          return (
            <Card key={role} className="border shadow-none">
              <CardContent className="p-3"><p className="text-xl font-bold leading-none">{count}</p><p className="text-xs text-muted-foreground mt-1">{ROLE_LABELS[role]}</p></CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-cr" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-52" data-testid="select-role-filter-cr"><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            {CAT_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Tag className="w-4 h-4" />Prestataires avec catégories ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Tag className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Aucun résultat trouvé.</p></div>
          ) : (
            <div className="divide-y divide-border/40">
              {filtered.map(u => {
                const displayCats = getDisplayCategories(u);
                const isSupplier = u.role === 'SUPPLIER';
                const supplierId = Number(u.id);
                const isExpanded = isSupplier && expandedSupplierId === supplierId;
                const mappingCounts = isSupplier ? getSupplierMappingCounts(supplierId, supplierMappingEntries) : null;
                const hasPendingMappings = (mappingCounts?.pendingCount ?? 0) > 0;
                return (
                  <div key={u.id} data-testid={`row-user-${u.id}`} className={hasPendingMappings ? "bg-amber-50/60 dark:bg-amber-950/10" : undefined}>
                    <div className={`flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors ${hasPendingMappings ? "border-l-4 border-l-amber-400" : ""} ${isExpanded ? "bg-secondary/30" : ""}`}>
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">{u.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(u.role)}`}>{ROLE_LABELS[u.role]}</span>
                          {u.status === "pending" && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><Clock className="w-3 h-3 inline mr-0.5" />En attente</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                        {!isSupplier && displayCats.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {displayCats.slice(0, 5).map(cat => <span key={cat} className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-full">{cat}</span>)}
                            {displayCats.length > 5 && <span className="text-xs text-muted-foreground self-center">+{displayCats.length - 5}</span>}
                          </div>
                        )}
                        {isSupplier && !isExpanded && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {mappingCounts!.approvedCount > 0 && (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">
                                Approved {mappingCounts!.approvedCount}
                              </Badge>
                            )}
                            {mappingCounts!.pendingCount > 0 && (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">
                                Pending {mappingCounts!.pendingCount}
                              </Badge>
                            )}
                            {mappingCounts!.frozenCount > 0 && (
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-0 text-xs">
                                Frozen {mappingCounts!.frozenCount}
                              </Badge>
                            )}
                            {displayCats.length === 0 && (
                              <span className="text-xs text-muted-foreground">No category mappings</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSupplier && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleSupplierExpand(supplierId);
                            }}
                            data-testid={`button-expand-supplier-${u.id}`}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                            Categories
                          </Button>
                        )}
                        {!isSupplier && (
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => openEdit(u)} data-testid={`button-edit-cats-${u.id}`}><Tag className="w-3.5 h-3.5 mr-1" />Modifier</Button>
                        )}
                        {u.status === "pending" && (
                          <>
                            <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveMutation.mutate(u.id)} disabled={approveMutation.isPending} data-testid={`button-approve-${u.id}`}><CheckCircle className="w-3.5 h-3.5 mr-1" />Approuver</Button>
                            <Button size="sm" variant="destructive" className="text-xs" onClick={() => rejectMutation.mutate(u.id)} disabled={rejectMutation.isPending} data-testid={`button-reject-${u.id}`}><XCircle className="w-3.5 h-3.5 mr-1" />Rejeter</Button>
                          </>
                        )}
                      </div>
                    </div>
                    {isExpanded && <SupplierCategoryOverviewPanel supplierId={supplierId} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {editUser && (
        <CategoryEditModalInline
          user={editUser}
          open={!!editUser}
          onClose={() => { setEditUser(null); setEditUserCatIds([]); }}
          supplierCatIds={editUser.role === 'SUPPLIER' ? editUserCatIds : undefined}
        />
      )}
    </div>
  );
}

// ── SUPPLIER CATEGORIES SECTION ───────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  category: 'Category', subcategory: 'Sub-category', brand: 'Brand', flavor: 'Flavor', size: 'Size',
};

function SuggestionStatusBadge({ status }: { status: string }) {
  if (status === 'PENDING') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending</Badge>;
  if (status === 'ACTIVE') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === 'REJECTED') return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function SupplierCategoriesSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<CatalogSuggestion | null>(null);
  const [editTarget, setEditTarget] = useState<CatalogSuggestion | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', icon: '', status: '' });

  const { data: suggestions = [], isLoading } = useQuery<CatalogSuggestion[]>({ queryKey: ["/api/admin/catalog-suggestions"] });
  const { data: cats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });

  const approve = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiRequest("PATCH", `/api/admin/catalog-suggestions/${type}/${id}/approve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/catalog-suggestions"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/subcategories"] });
      qc.invalidateQueries({ queryKey: ["/api/flavors"] });
      qc.invalidateQueries({ queryKey: ["/api/sizes"] });
      qc.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Suggestion approved", description: "The item is now active in the catalog." });
    },
    onError: () => toast({ title: "Error approving", variant: "destructive" }),
  });

  const edit = useMutation({
    mutationFn: ({ type, id, data }: { type: string; id: number; data: any }) =>
      apiRequest("PATCH", `/api/admin/catalog-suggestions/${type}/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/catalog-suggestions"] }); toast({ title: "Updated" }); setEditTarget(null); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiRequest("DELETE", `/api/admin/catalog-suggestions/${type}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/catalog-suggestions"] }); toast({ title: "Deleted" }); setDeleteTarget(null); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  let filtered = suggestions;
  if (typeFilter !== "all") filtered = filtered.filter(s => s.type === typeFilter);
  if (statusFilter !== "all") filtered = filtered.filter(s => s.status === statusFilter);

  const pendingCount = suggestions.filter(s => s.status === 'PENDING').length;

  const openEdit = (s: CatalogSuggestion) => {
    setEditTarget(s);
    setEditForm({ name: s.name, description: s.description ?? '', icon: s.icon ?? '', status: s.status });
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><Clock className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold leading-none">{pendingCount}</p><p className="text-xs text-muted-foreground mt-0.5">Pending</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/30"><CheckCircle className="w-4 h-4 text-emerald-600" /></div>
            <div><p className="text-xl font-bold leading-none">{suggestions.filter(s => s.status === 'ACTIVE').length}</p><p className="text-xs text-muted-foreground mt-0.5">Approved</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-red-50 dark:bg-red-950/30"><XCircle className="w-4 h-4 text-red-600" /></div>
            <div><p className="text-xl font-bold leading-none">{suggestions.filter(s => s.status === 'REJECTED').length}</p><p className="text-xs text-muted-foreground mt-0.5">Rejected</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/30"><Layers className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold leading-none">{suggestions.length}</p><p className="text-xs text-muted-foreground mt-0.5">Total</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-type-filter"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-status-filter"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="ACTIVE">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} suggestion{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={`${s.type}-${s.id}`} data-testid={`row-suggestion-${s.type}-${s.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {s.icon && <span className="text-lg">{s.icon}</span>}
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{TYPE_LABELS[s.type] ?? s.type}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.supplierName ?? '—'}</TableCell>
                  <TableCell><SuggestionStatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {s.status === 'PENDING' && (
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => approve.mutate({ type: s.type, id: s.id })} disabled={approve.isPending}
                          data-testid={`button-approve-suggestion-${s.id}`}>
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)} data-testid={`button-edit-suggestion-${s.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)} data-testid={`button-delete-suggestion-${s.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    {suggestions.length === 0 ? "No supplier suggestions yet." : "No suggestions match the current filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit Suggestion</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Icon</Label>
                  <Input value={editForm.icon} onChange={e => setEditForm(f => ({ ...f, icon: e.target.value }))} className="text-center text-lg" placeholder="☕" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Name *</Label>
                  <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="ACTIVE">Approved (Active)</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button onClick={() => edit.mutate({ type: editTarget.type, id: editTarget.id, data: editForm })} disabled={!editForm.name.trim() || edit.isPending}>
                  {edit.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {deleteTarget && (
        <DeleteConfirm open onClose={() => setDeleteTarget(null)} name={deleteTarget.name}
          onConfirm={() => remove.mutate({ type: deleteTarget.type, id: deleteTarget.id })} />
      )}
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function AdminCategoriesPage() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const [section, setSection] = useState<'management' | 'category-requests' | 'supplier-cats'>('management');

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const urlSection = params.get("section");
    if (urlSection === "category-requests" || urlSection === "supplier-cats" || urlSection === "management") {
      setSection(urlSection);
    }
  }, [searchStr]);

  const handleSectionChange = (key: 'management' | 'category-requests' | 'supplier-cats') => {
    setSection(key);
    if (key === "management") setLocation("/admin/categories");
    else setLocation(`/admin/categories?section=${key}`);
  };

  const { data: cats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: subs = [] } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });
  const { data: flavs = [] } = useQuery<FlavorWithCount[]>({ queryKey: ["/api/flavors"] });
  const { data: szs = [] } = useQuery<SizeWithCount[]>({ queryKey: ["/api/sizes"] });
  const { data: brnds = [] } = useQuery<BrandWithCount[]>({ queryKey: ["/api/brands"] });

  const stats = [
    { label: "Categories", value: cats.length, icon: Folder, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
    { label: "Sub-categories", value: subs.length, icon: Layers, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
    { label: "Flavors", value: flavs.length, icon: Tag, color: "text-pink-600 bg-pink-50 dark:bg-pink-950/30" },
    { label: "Sizes", value: szs.length, icon: Ruler, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
    { label: "Brands", value: brnds.length, icon: Award, color: "text-green-600 bg-green-50 dark:bg-green-950/30" },
  ];

  const sections = [
    { key: 'management' as const, label: 'Category Management' },
    { key: 'category-requests' as const, label: 'Category Requests' },
    { key: 'supplier-cats' as const, label: 'Supplier Categories' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage product taxonomy, review category requests, and approve supplier suggestions.
        </p>
      </div>

      {/* Section switcher */}
      <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg w-fit border">
        {sections.map(s => (
          <button key={s.key} onClick={() => handleSectionChange(s.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${section === s.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid={`section-tab-${s.key}`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'management' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.map(s => (
              <Card key={s.label} className="border shadow-none">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${s.color}`}><s.icon className="w-4 h-4" /></div>
                  <div><p className="text-2xl font-bold leading-none">{s.value}</p><p className="text-xs text-muted-foreground mt-0.5">{s.label}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Tabs defaultValue="categories" className="w-full">
            <TabsList className="mb-2 flex-wrap h-auto">
              <TabsTrigger value="categories" data-testid="tab-categories"><Folder className="w-4 h-4 mr-1.5" />Categories</TabsTrigger>
              <TabsTrigger value="subcategories" data-testid="tab-subcategories"><Layers className="w-4 h-4 mr-1.5" />Sub-categories</TabsTrigger>
              <TabsTrigger value="flavors" data-testid="tab-flavors"><Tag className="w-4 h-4 mr-1.5" />Flavors</TabsTrigger>
              <TabsTrigger value="sizes" data-testid="tab-sizes"><Ruler className="w-4 h-4 mr-1.5" />Sizes</TabsTrigger>
              <TabsTrigger value="brands" data-testid="tab-brands"><Award className="w-4 h-4 mr-1.5" />Brands</TabsTrigger>
            </TabsList>
            <TabsContent value="categories">
              <Card className="border shadow-none"><CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Folder className="w-4 h-4" />Categories</CardTitle></CardHeader><CardContent className="p-4"><CategoriesTab /></CardContent></Card>
            </TabsContent>
            <TabsContent value="subcategories">
              <Card className="border shadow-none"><CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" />Sub-categories</CardTitle></CardHeader><CardContent className="p-4"><SubCategoriesTab /></CardContent></Card>
            </TabsContent>
            <TabsContent value="flavors">
              <Card className="border shadow-none"><CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Tag className="w-4 h-4" />Flavors</CardTitle></CardHeader>
              <CardContent className="p-4"><TaxonomyCrudTab title="Flavor" icon={Tag} apiPath="/api/flavors" queryKey="/api/flavors" testPrefix="flavor" cats={cats} subs={subs} /></CardContent></Card>
            </TabsContent>
            <TabsContent value="sizes">
              <Card className="border shadow-none"><CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Ruler className="w-4 h-4" />Sizes</CardTitle></CardHeader>
              <CardContent className="p-4"><TaxonomyCrudTab title="Size" icon={Ruler} apiPath="/api/sizes" queryKey="/api/sizes" testPrefix="size" extraFields={[{ key: "value", label: "Value / Unit", placeholder: "e.g. 500ml, 1kg", hint: "The measurable size unit (optional)" }]} cats={cats} subs={subs} /></CardContent></Card>
            </TabsContent>
            <TabsContent value="brands">
              <Card className="border shadow-none"><CardHeader className="pb-0 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" />Brands</CardTitle></CardHeader>
              <CardContent className="p-4"><TaxonomyCrudTab title="Brand" icon={Award} apiPath="/api/brands" queryKey="/api/brands" testPrefix="brand" cats={cats} subs={subs} /></CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {section === 'category-requests' && <CategoryRequestsSection />}
      {section === 'supplier-cats' && <SupplierCategoriesSection />}
    </div>
  );
}
