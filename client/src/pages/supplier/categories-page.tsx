import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Check, Layers, ChevronDown, ChevronUp, RefreshCw, Pencil, Trash2, SendHorizonal, MousePointerClick, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CategoryWithCount, SupplierCategoryMapping, SubCategoryWithDetails, CatalogSuggestion } from "@shared/schema";
import { useSupplierCategoryStore } from "@/store/supplier-category-store";

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'PENDING') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending Review</Badge>;
  if (status === 'ACTIVE') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === 'REJECTED') return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ── Category Selection Modal ─────────────────────────────────────────────────

function CategorySelectModal({
  open, onClose, allCategories, selectedIds, onConfirm, isPending,
}: {
  open: boolean; onClose: () => void; allCategories: CategoryWithCount[];
  selectedIds: number[]; onConfirm: (ids: number[]) => void; isPending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [local, setLocal] = useState<number[]>(selectedIds);
  const filtered = allCategories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: number) => setLocal(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary" />Select Categories</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">Choose the categories your business operates in.</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-categories" />
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto py-1 pr-1">
          {filtered.map(cat => {
            const selected = local.includes(cat.id);
            return (
              <button key={cat.id} onClick={() => toggle(cat.id)} data-testid={`toggle-cat-${cat.id}`}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"}`}>
                <span className="text-2xl leading-none">{cat.icon || "📦"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.subCategoryCount} sub-cats</p>
                </div>
                {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">No categories match your search.</div>}
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">{local.length} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onConfirm(local)} disabled={isPending} data-testid="button-confirm-categories">
              {isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}Confirm Selection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Category Mapping Card ─────────────────────────────────────────────────────

function CategoryMappingCard({
  mapping, onSubToggle, isSaving,
  isSelected, onSelect,
  selectedSubCategoryId, onSelectSubCategory,
}: {
  mapping: SupplierCategoryMapping;
  onSubToggle: (subId: number, checked: boolean) => void;
  isSaving: boolean;
  isSelected: boolean;
  onSelect: () => void;
  selectedSubCategoryId: number | null;
  onSelectSubCategory: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { category, subCategories, selectedSubCategoryIds } = mapping;
  const selectedCount = selectedSubCategoryIds.length;

  return (
    <Card
      className={`overflow-hidden transition-all ${isSelected ? "border-primary ring-1 ring-primary shadow-sm" : "hover:border-primary/30"}`}
      data-testid={`card-category-${category.id}`}
    >
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-3 flex-1 text-left cursor-pointer"
            onClick={onSelect}
            data-testid={`button-select-category-${category.id}`}
          >
            <span className="text-2xl">{category.icon || "📦"}</span>
            <div>
              <p className="font-semibold text-base">{category.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedCount} of {subCategories.length} sub-categories selected</p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            {isSelected && <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Active</Badge>}
            {selectedCount > 0 && !isSelected && <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{selectedCount} active</Badge>}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (!expanded) onSelect(); setExpanded(e => !e); }} data-testid={`button-toggle-cat-${category.id}`}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
      {expanded && (
        <CardContent className="pt-4">
          {subCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No sub-categories defined yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {subCategories.map(sub => {
                const isMapped = selectedSubCategoryIds.includes(sub.id);
                const isSubSelected = selectedSubCategoryId === sub.id;
                return (
                  <div
                    key={sub.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${isSubSelected ? "border-primary bg-primary/8 shadow-sm" : isMapped ? "border-primary/40 bg-primary/5" : "border-border"}`}
                    data-testid={`subcat-item-${sub.id}`}
                  >
                    <Checkbox
                      checked={isMapped}
                      onCheckedChange={checked => {
                        onSubToggle(sub.id, !!checked);
                        if (checked) { onSelect(); onSelectSubCategory(sub.id); }
                      }}
                      disabled={isSaving}
                      data-testid={`checkbox-subcat-${sub.id}`}
                    />
                    <button
                      className="flex-1 min-w-0 text-left cursor-pointer"
                      onClick={() => { onSelect(); onSelectSubCategory(sub.id); }}
                      data-testid={`button-select-subcat-${sub.id}`}
                    >
                      <p className={`text-sm font-medium truncate ${isSubSelected ? "text-primary" : ""}`}>{sub.name}</p>
                      {sub.description && <p className="text-xs text-muted-foreground truncate">{sub.description}</p>}
                    </button>
                    {isSubSelected && <MousePointerClick className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── My Categories Section ─────────────────────────────────────────────────────

function MyCategoriesSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { selectedCategoryId, selectedSubCategoryId, setSelectedCategory, setSelectedSubCategory } = useSupplierCategoryStore();

  const { data: allCats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: mappings = [], isLoading } = useQuery<SupplierCategoryMapping[]>({ queryKey: ["/api/supplier/categories"] });

  const saveCategories = useMutation({
    mutationFn: (categoryIds: number[]) => apiRequest("POST", "/api/supplier/categories", { categoryIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] }); toast({ title: "Categories updated" }); setModalOpen(false); },
    onError: () => toast({ title: "Error saving categories", variant: "destructive" }),
  });

  const saveSubCategories = useMutation({
    mutationFn: (subCategoryIds: number[]) => apiRequest("POST", "/api/supplier/subcategories", { subCategoryIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] }); toast({ title: "Sub-categories saved" }); },
    onError: () => toast({ title: "Error saving sub-categories", variant: "destructive" }),
  });

  const allSelectedSubIds = mappings.flatMap(m => m.selectedSubCategoryIds);
  const handleSubToggle = (subId: number, checked: boolean) => {
    const newIds = checked ? Array.from(new Set([...allSelectedSubIds, subId])) : allSelectedSubIds.filter(id => id !== subId);
    saveSubCategories.mutate(newIds);
  };

  const selectedCatIds = mappings.map(m => m.category.id);

  // Show all categories the supplier has selected — no product-based filtering here.
  // The supplier selects categories first, then adds products under them.
  const filteredMappings = mappings;

  const handleSelectCategory = (id: number) => {
    setSelectedCategory(id);
  };

  const handleSelectSubCategory = (catId: number, subId: number) => {
    setSelectedCategory(catId);
    setSelectedSubCategory(subId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <Card className="border shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/30"><Layers className="w-4 h-4 text-blue-600" /></div>
              <div><p className="text-xl font-bold leading-none">{filteredMappings.length}</p><p className="text-xs text-muted-foreground mt-0.5">Selected categories</p></div>
            </CardContent>
          </Card>
          <Card className="border shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg p-2 bg-purple-50 dark:bg-purple-950/30"><Check className="w-4 h-4 text-purple-600" /></div>
              <div><p className="text-xl font-bold leading-none">{allSelectedSubIds.length}</p><p className="text-xs text-muted-foreground mt-0.5">Sub-categories active</p></div>
            </CardContent>
          </Card>
          <Card className="border shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><RefreshCw className="w-4 h-4 text-amber-600" /></div>
              <div><p className="text-xl font-bold leading-none">{allCats.length}</p><p className="text-xs text-muted-foreground mt-0.5">Available</p></div>
            </CardContent>
          </Card>
        </div>
        <Button onClick={() => setModalOpen(true)} data-testid="button-add-category" className="gap-2">
          <Plus className="w-4 h-4" />Add Category
        </Button>
      </div>

      {/* Selection hint */}
      {filteredMappings.length > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 flex-shrink-0" />
          Click a category header to select it, then click a sub-category name to filter products in the Products page.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
      ) : filteredMappings.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4"><Layers className="w-8 h-8 text-muted-foreground" /></div>
            <div>
              <p className="font-semibold text-lg">No categories selected yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Click "Add Category" to choose the product categories your business offers.
              </p>
            </div>
            <Button onClick={() => setModalOpen(true)} data-testid="button-add-category-empty" className="gap-2"><Plus className="w-4 h-4" />Add Category</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMappings.map(mapping => (
            <CategoryMappingCard
              key={mapping.category.id}
              mapping={mapping}
              onSubToggle={handleSubToggle}
              isSaving={saveSubCategories.isPending}
              isSelected={selectedCategoryId === mapping.category.id}
              onSelect={() => handleSelectCategory(mapping.category.id)}
              selectedSubCategoryId={selectedCategoryId === mapping.category.id ? selectedSubCategoryId : null}
              onSelectSubCategory={(subId) => handleSelectSubCategory(mapping.category.id, subId)}
            />
          ))}
          <Button variant="outline" onClick={() => setModalOpen(true)} className="gap-2" data-testid="button-manage-categories"><Plus className="w-4 h-4" />Manage Category Selection</Button>
        </div>
      )}

      <CategorySelectModal open={modalOpen} onClose={() => setModalOpen(false)} allCategories={allCats} selectedIds={selectedCatIds} onConfirm={ids => saveCategories.mutate(ids)} isPending={saveCategories.isPending} />
    </div>
  );
}

// ── Category Requests Section ─────────────────────────────────────────────────

const SUGGESTION_TYPES = [
  { key: 'category' as const, label: 'Category' },
  { key: 'subcategory' as const, label: 'Sub-category' },
  { key: 'brand' as const, label: 'Brand' },
  { key: 'flavor' as const, label: 'Flavor' },
  { key: 'size' as const, label: 'Size' },
];

const EMPTY_FORM = { name: '', icon: '', description: '', categoryId: '', value: '' };

function CategoryRequestsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<'category' | 'subcategory' | 'brand' | 'flavor' | 'size'>('category');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogSuggestion | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CatalogSuggestion | null>(null);

  const { data: suggestions = [], isLoading } = useQuery<CatalogSuggestion[]>({ queryKey: ["/api/supplier/catalog-suggestions"] });
  const { data: cats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: subs = [] } = useQuery<SubCategoryWithDetails[]>({ queryKey: ["/api/subcategories"] });

  // Merge approved categories with supplier's own pending category suggestions
  // so the supplier can create subcategories before parent is approved
  const pendingCatSuggestions = suggestions.filter(s => s.type === 'category' && s.status === 'PENDING');
  const allCategoryOptions: Array<{ id: number; name: string; icon?: string | null }> = [
    ...cats,
    ...pendingCatSuggestions
      .filter(s => !cats.find(c => c.id === s.id))
      .map(s => ({ id: s.id, name: `${s.name} (Pending)`, icon: s.icon })),
  ];

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/supplier/catalog-suggestions", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] }); toast({ title: "Suggestion submitted", description: "Your suggestion is pending admin review." }); setDialogOpen(false); setForm(EMPTY_FORM); },
    onError: (err: any) => toast({ title: err?.message ?? "Error submitting suggestion", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ type, id, data }: { type: string; id: number; data: any }) =>
      apiRequest("PATCH", `/api/supplier/catalog-suggestions/${type}/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] }); toast({ title: "Suggestion updated" }); setDialogOpen(false); setEditing(null); setForm(EMPTY_FORM); },
    onError: () => toast({ title: "Error updating", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiRequest("DELETE", `/api/supplier/catalog-suggestions/${type}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] }); toast({ title: "Suggestion deleted" }); setDeleteTarget(null); },
    onError: () => toast({ title: "Error deleting", variant: "destructive" }),
  });

  const filtered = suggestions.filter(s => s.type === activeType);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: allCategoryOptions[0] ? String(allCategoryOptions[0].id) : '' });
    setDialogOpen(true);
  };

  const openEdit = (s: CatalogSuggestion) => {
    setEditing(s);
    setForm({
      name: s.name, icon: s.icon ?? '', description: s.description ?? '',
      categoryId: (s as any).categoryId ? String((s as any).categoryId) : (allCategoryOptions[0] ? String(allCategoryOptions[0].id) : ''),
      value: (s as any).value ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (activeType === 'subcategory' && !form.categoryId) return toast({ title: "Parent category is required", variant: "destructive" });
    const payload: any = { type: activeType, name: form.name.trim(), icon: form.icon.trim() || null, description: form.description.trim() || null };
    if (activeType === 'subcategory') payload.categoryId = parseInt(form.categoryId);
    if (activeType === 'size') payload.value = form.value.trim() || null;
    if (editing) {
      update.mutate({ type: activeType, id: editing.id, data: payload });
    } else {
      create.mutate(payload);
    }
  };

  const pendingCount = suggestions.filter(s => s.status === 'PENDING').length;
  const approvedCount = suggestions.filter(s => s.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><SendHorizonal className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold leading-none">{pendingCount}</p><p className="text-xs text-muted-foreground mt-0.5">Pending</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/30"><Check className="w-4 h-4 text-emerald-600" /></div>
            <div><p className="text-xl font-bold leading-none">{approvedCount}</p><p className="text-xs text-muted-foreground mt-0.5">Approved</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/30"><Layers className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold leading-none">{suggestions.length}</p><p className="text-xs text-muted-foreground mt-0.5">Total submitted</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
        Suggest new catalog items (categories, sub-categories, brands, flavors, or sizes) for admin review. Once approved, they become available in the marketplace.
        <br /><span className="opacity-80">You can create sub-categories under a pending category — the entire hierarchy will be reviewed together.</span>
      </div>

      {/* Type switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg border">
          {SUGGESTION_TYPES.map(t => (
            <button key={t.key} onClick={() => setActiveType(t.key)} data-testid={`type-tab-${t.key}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeType === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t.label}
              {suggestions.filter(s => s.type === t.key).length > 0 && (
                <span className="ml-1.5 text-xs opacity-60">({suggestions.filter(s => s.type === t.key).length})</span>
              )}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate} data-testid="button-create-suggestion" className="gap-1.5">
          <Plus className="w-4 h-4" />Suggest New {SUGGESTION_TYPES.find(t => t.key === activeType)?.label}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {activeType === 'subcategory' && <TableHead>Parent Category</TableHead>}
                {activeType === 'size' && <TableHead>Value / Unit</TableHead>}
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id} data-testid={`row-suggestion-${s.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {s.icon && <span className="text-lg">{s.icon}</span>}
                      <span className="font-medium text-sm">{s.name}</span>
                    </div>
                  </TableCell>
                  {activeType === 'subcategory' && (
                    <TableCell className="text-sm text-muted-foreground">
                      {allCategoryOptions.find(c => c.id === (s as any).categoryId)?.name ?? '—'}
                    </TableCell>
                  )}
                  {activeType === 'size' && (
                    <TableCell className="text-sm text-muted-foreground">{(s as any).value || '—'}</TableCell>
                  )}
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{s.description || '—'}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell>
                    {s.status === 'PENDING' && (
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)} data-testid={`button-edit-suggestion-${s.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)} data-testid={`button-delete-suggestion-${s.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    <p className="font-medium">No {SUGGESTION_TYPES.find(t => t.key === activeType)?.label.toLowerCase()} suggestions yet.</p>
                    <p className="text-xs mt-1">Click "Suggest New…" to propose one for admin approval.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditing(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Suggestion" : `Suggest New ${SUGGESTION_TYPES.find(t => t.key === activeType)?.label}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Parent category (subcategory only) — includes supplier's own PENDING categories */}
            {activeType === 'subcategory' && (
              <div className="space-y-1.5">
                <Label>Parent Category *</Label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger data-testid="select-suggestion-category"><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    {allCategoryOptions.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.icon ? `${c.icon} ` : ''}{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pendingCatSuggestions.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Categories marked "(Pending)" are your own suggestions awaiting approval.
                  </p>
                )}
              </div>
            )}
            {/* Icon + Name */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Icon (emoji)</Label>
                <Input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="☕" className="text-center text-lg" data-testid="input-suggestion-icon" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={`e.g. ${activeType === 'flavor' ? 'Vanilla' : activeType === 'size' ? 'Large' : activeType === 'brand' ? 'Lavazza' : 'New item'}`} data-testid="input-suggestion-name" />
              </div>
            </div>
            {/* Size value */}
            {activeType === 'size' && (
              <div className="space-y-1.5">
                <Label>Value / Unit</Label>
                <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="e.g. 500ml, 1kg, Large" data-testid="input-suggestion-value" />
              </div>
            )}
            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description (optional)" data-testid="input-suggestion-description" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || (activeType === 'subcategory' && !form.categoryId) || create.isPending || update.isPending} data-testid="button-save-suggestion">
                {(create.isPending || update.isPending) ? "Submitting…" : editing ? "Save Changes" : "Submit Suggestion"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Delete "{deleteTarget.name}"?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This will permanently remove your suggestion.</p>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => remove.mutate({ type: deleteTarget.type, id: deleteTarget.id })} disabled={remove.isPending} data-testid="button-confirm-delete-suggestion">
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SupplierCategoriesPage() {
  const [activeSection, setActiveSection] = useState<'my-categories' | 'category-requests'>('my-categories');

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your categories and suggest new catalog items for admin approval.
        </p>
      </div>

      {/* Section switcher */}
      <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg w-fit border">
        <button onClick={() => setActiveSection('my-categories')} data-testid="tab-my-categories"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeSection === 'my-categories' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          My Categories
        </button>
        <button onClick={() => setActiveSection('category-requests')} data-testid="tab-category-requests"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeSection === 'category-requests' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          Category Requests
        </button>
      </div>

      {activeSection === 'my-categories' && <MyCategoriesSection />}
      {activeSection === 'category-requests' && <CategoryRequestsSection />}
    </div>
  );
}
