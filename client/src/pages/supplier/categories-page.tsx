import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Check, Layers, ChevronDown, ChevronUp, RefreshCw, Pencil, Trash2, SendHorizonal, MousePointerClick, Snowflake, GripVertical, X } from "lucide-react";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";
import { CatalogSuggestionCard } from "@/components/shared/catalog-suggestion-card";
import type { QueryClient } from "@tanstack/react-query";

function invalidateCategoryMappingSync(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/supplier-mappings"] });
  qc.refetchQueries({ queryKey: ["/api/admin/supplier-mappings"], type: "active" });
}
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { CategoryWithCount, SupplierCategoryMapping, SubCategoryWithDetails, CatalogSuggestion } from "@shared/schema";
import { useSupplierCategoryStore } from "@/store/supplier-category-store";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'PENDING') return <Badge className="bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">En attente de validation</Badge>;
  if (status === 'ACTIVE') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approuvée</Badge>;
  if (status === 'REJECTED') return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Refusée</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ── Category Selection Modal ─────────────────────────────────────────────────

function CategorySelectModal({
  open, onClose, allCategories, mappedIds, onConfirm, isPending,
}: {
  open: boolean; onClose: () => void; allCategories: CategoryWithCount[];
  mappedIds: number[]; onConfirm: (ids: number[]) => void; isPending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [local, setLocal] = useState<number[]>([]);
  const available = allCategories.filter(c => c.productCount > 0 && !mappedIds.includes(c.id));
  const filtered = available.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: number) => setLocal(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose className="sm:max-w-lg">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-category-select">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary" />Ajouter des catégories</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">Sélectionnez les catégories à demander. Les nouvelles demandes nécessitent l'approbation de l'administration.</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher des catégories…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-categories" />
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
                  <p className="text-xs text-muted-foreground">{cat.subCategoryCount} sous-catégories</p>
                </div>
                {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
           {filtered.length === 0 && <div className="col-span-2 text-center py-8 text-muted-foreground text-sm">{available.length === 0 ? "Aucune catégorie avec des produits disponibles à ajouter." : "Aucune catégorie ne correspond à votre recherche."}</div>}
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">{local.length} sélectionnée(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => { onConfirm(local); setLocal([]); }} disabled={isPending || local.length === 0} data-testid="button-confirm-categories">
              {isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}Demander {local.length || ""} catégorie{local.length === 1 ? "" : "s"}
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
  onFreeze, onRemove, isActionPending,
  onDragStart, onDragOver, onDrop,
}: {
  mapping: SupplierCategoryMapping;
  onSubToggle: (subId: number, checked: boolean) => void;
  isSaving: boolean;
  isSelected: boolean;
  onSelect: () => void;
  selectedSubCategoryId: number | null;
  onSelectSubCategory: (id: number) => void;
  onFreeze: () => void;
  onRemove: () => void;
  isActionPending: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { category, subCategories, selectedSubCategoryIds, mappingStatus, isFrozen } = mapping;
  const selectedCount = selectedSubCategoryIds.length;

  const borderClass = isFrozen
    ? "border-muted-foreground/50 bg-muted/20"
    : mappingStatus === "APPROVED"
      ? "border-emerald-400 dark:border-emerald-700"
      : "border-red-400 dark:border-red-700";

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`overflow-hidden transition-all ${borderClass} ${isSelected ? "ring-1 ring-primary shadow-sm" : "hover:border-primary/30"}`}
      data-testid={`card-category-${category.id}`}
    >
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-3 flex-1 text-left cursor-pointer"
            onClick={onSelect}
            data-testid={`button-select-category-${category.id}`}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground/60 shrink-0 cursor-grab" aria-label="Glisser pour réorganiser" />
            <span className="text-2xl">{category.icon || "📦"}</span>
            <div>
              <p className="font-semibold text-base">{category.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedCount} sur {subCategories.length} sous-catégories sélectionnées</p>
            </div>
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isFrozen && <Badge variant="secondary" className="text-xs">Gelée</Badge>}
            {!isFrozen && mappingStatus === "PENDING" && <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 border-0 text-xs">En attente</Badge>}
            {!isFrozen && mappingStatus === "APPROVED" && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0 text-xs">Approuvée</Badge>}
            {mappingStatus === "APPROVED" && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onFreeze} disabled={isActionPending}>
                <Snowflake className="w-3 h-3 mr-1" />{isFrozen ? "Dégeler" : "Geler"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onRemove} disabled={isActionPending}>
              <Trash2 className="w-3 h-3 mr-1" />Retirer
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { if (!expanded) onSelect(); setExpanded(e => !e); }} data-testid={`button-toggle-cat-${category.id}`}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
      {expanded && (
        <CardContent className="pt-4">
          {subCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucune sous-catégorie définie pour le moment.</p>
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

function MyCategoriesSection({ modalOpen, setModalOpen }: { modalOpen: boolean; setModalOpen: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [orderedMappings, setOrderedMappings] = useState<SupplierCategoryMapping[]>([]);
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SupplierCategoryMapping | null>(null);

  const { selectedCategoryId, selectedSubCategoryId, setSelectedCategory, setSelectedSubCategory } = useSupplierCategoryStore();

  const { data: allCats = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: mappings = [], isLoading } = useQuery<SupplierCategoryMapping[]>({ queryKey: ["/api/supplier/categories"] });
  useEffect(() => setOrderedMappings(mappings), [mappings]);

  const saveOrder = useMutation({
    mutationFn: (categoryIds: number[]) => apiRequest("PATCH", "/api/supplier/categories/order", { categoryIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/categories"] });
      invalidateMarketplace(qc);
      toast({ title: "Ordre des catégories enregistré" });
    },
    onError: () => {
      setOrderedMappings(mappings);
      toast({ title: "Erreur lors de l'enregistrement de l'ordre des catégories", variant: "destructive" });
    },
  });

  const saveCategories = useMutation({
    mutationFn: (categoryIds: number[]) => apiRequest("POST", "/api/supplier/categories", { categoryIds }),
    onSuccess: () => {
      invalidateCategoryMappingSync(qc);
      invalidateMarketplace(qc);
      toast({ title: "Demande de catégorie envoyée", description: "En attente de l'approbation de l'administration." });
      setModalOpen(false);
    },
    onError: () => toast({ title: "Erreur lors de l'enregistrement des catégories", variant: "destructive" }),
  });

  const freezeCategory = useMutation({
    mutationFn: ({ categoryId, isFrozen }: { categoryId: number; isFrozen: boolean }) =>
      apiRequest("PATCH", `/api/supplier/categories/${categoryId}/freeze`, { isFrozen }),
    onSuccess: () => { invalidateCategoryMappingSync(qc); invalidateMarketplace(qc); toast({ title: "Statut de gel mis à jour" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const removeCategory = useMutation({
    mutationFn: (categoryId: number) => apiRequest("DELETE", `/api/supplier/categories/${categoryId}`),
    onSuccess: () => { invalidateCategoryMappingSync(qc); invalidateMarketplace(qc); toast({ title: "Catégorie retirée" }); pagination.resetPage(); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const saveSubCategories = useMutation({
    mutationFn: (subCategoryIds: number[]) => apiRequest("POST", "/api/supplier/subcategories", { subCategoryIds }),
    onSuccess: () => { invalidateCategoryMappingSync(qc); toast({ title: "Sous-catégories enregistrées" }); },
    onError: () => toast({ title: "Erreur lors de l'enregistrement des sous-catégories", variant: "destructive" }),
  });

  const allSelectedSubIds = mappings.flatMap(m => m.selectedSubCategoryIds);
  const handleSubToggle = (subId: number, checked: boolean) => {
    const newIds = checked ? Array.from(new Set([...allSelectedSubIds, subId])) : allSelectedSubIds.filter(id => id !== subId);
    saveSubCategories.mutate(newIds);
  };

  const selectedCatIds = orderedMappings.map(m => m.category.id);

  // Show all categories the supplier has selected — no product-based filtering here.
  // The supplier selects categories first, then adds products under them.
  const filteredMappings = orderedMappings;

  // Drag-and-drop reordering (onDrop below) already resolves positions by
  // `category.id` via findIndex against the full `orderedMappings` array, not by
  // rendered index — so paginating which rows DISPLAY doesn't affect reordering.
  const pagination = usePagination(filteredMappings.length);
  useEffect(() => { pagination.resetPage(); }, [filteredMappings.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageMappings = filteredMappings.slice(pagination.start, pagination.end);

  const handleSelectCategory = (id: number) => {
    setSelectedCategory(id);
  };

  const handleSelectSubCategory = (catId: number, subId: number) => {
    setSelectedCategory(catId);
    setSelectedSubCategory(subId);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/30"><Layers className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold leading-none">{filteredMappings.length}</p><p className="text-xs text-muted-foreground mt-0.5">Catégories sélectionnées</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-purple-50 dark:bg-purple-950/30"><Check className="w-4 h-4 text-purple-600" /></div>
            <div><p className="text-xl font-bold leading-none">{allSelectedSubIds.length}</p><p className="text-xs text-muted-foreground mt-0.5">Sous-catégories actives</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><RefreshCw className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold leading-none">{allCats.length}</p><p className="text-xs text-muted-foreground mt-0.5">Disponibles</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Selection hint */}
      {filteredMappings.length > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 flex-shrink-0" />
          Cliquez sur l'en-tête d'une catégorie pour la sélectionner, puis sur le nom d'une sous-catégorie pour filtrer les produits dans la page Produits.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
      ) : filteredMappings.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-muted p-4"><Layers className="w-8 h-8 text-muted-foreground" /></div>
            <div>
              <p className="font-semibold text-lg">Aucune catégorie sélectionnée pour le moment</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Cliquez sur « Ajouter une catégorie » pour choisir les catégories de produits proposées par votre entreprise.
              </p>
            </div>
            <Button onClick={() => setModalOpen(true)} data-testid="button-add-category-empty" className="gap-2"><Plus className="w-4 h-4" />Ajouter une catégorie</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
           {pageMappings.map(mapping => (
            <CategoryMappingCard
              key={mapping.category.id}
              mapping={mapping}
              onSubToggle={handleSubToggle}
              isSaving={saveSubCategories.isPending}
              isSelected={selectedCategoryId === mapping.category.id}
              onSelect={() => handleSelectCategory(mapping.category.id)}
              selectedSubCategoryId={selectedCategoryId === mapping.category.id ? selectedSubCategoryId : null}
              onSelectSubCategory={(subId) => handleSelectSubCategory(mapping.category.id, subId)}
              onFreeze={() => freezeCategory.mutate({ categoryId: mapping.category.id, isFrozen: !mapping.isFrozen })}
              onRemove={() => setRemoveTarget(mapping)}
              isActionPending={freezeCategory.isPending || removeCategory.isPending}
              onDragStart={() => setDraggedCategoryId(mapping.category.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedCategoryId == null || draggedCategoryId === mapping.category.id) return;
                const next = [...orderedMappings];
                const from = next.findIndex((m) => m.category.id === draggedCategoryId);
                const to = next.findIndex((m) => m.category.id === mapping.category.id);
                if (from < 0 || to < 0) return;
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                setDraggedCategoryId(null);
                setOrderedMappings(next);
                saveOrder.mutate(next.map((m) => m.category.id));
              }}
            />
          ))}
          <Button variant="outline" onClick={() => setModalOpen(true)} className="gap-2" data-testid="button-manage-categories"><Plus className="w-4 h-4" />Gérer la sélection de catégories</Button>
          {filteredMappings.length > 0 && (
            <DataPagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={filteredMappings.length}
              totalPages={pagination.totalPages}
              start={pagination.start}
              end={pagination.end}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              itemLabel="catégories"
            />
          )}
        </div>
      )}

      <CategorySelectModal open={modalOpen} onClose={() => setModalOpen(false)} allCategories={allCats} mappedIds={selectedCatIds} onConfirm={ids => saveCategories.mutate(ids)} isPending={saveCategories.isPending} />

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer la catégorie ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cela retirera <strong>{removeTarget?.category.name}</strong> de vos catégories sélectionnées. Cela n'affecte que votre propre sélection — la catégorie elle-même et les autres fournisseurs ne sont pas affectés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (removeTarget) removeCategory.mutate(removeTarget.category.id); setRemoveTarget(null); }}
              disabled={removeCategory.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove-category"
            >
              {removeCategory.isPending ? "Retrait…" : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Category Requests Section ─────────────────────────────────────────────────
// Redesigned (task: "Supplier & Admin Categories — UI Standardization") to match Admin →
// Categories → Category Management's own card-grid visual language (CatalogSuggestionCard,
// shared with Admin's SupplierCategoriesSection below) instead of a plain Table — same
// stats/filters/pagination layout conventions, same suggestion data and hierarchy behavior.
// Suggestion `type` values ('category'|'subcategory'|'brand'|'flavor'|'size') are sent to
// the existing API exactly as before — only their DISPLAY labels are French.

const SUGGESTION_TYPES: { key: 'category' | 'subcategory' | 'brand' | 'flavor' | 'size'; label: string; article: string }[] = [
  { key: 'category', label: 'Catégorie', article: 'une catégorie' },
  { key: 'subcategory', label: 'Sous-catégorie', article: 'une sous-catégorie' },
  { key: 'brand', label: 'Marque', article: 'une marque' },
  { key: 'flavor', label: 'Saveur', article: 'une saveur' },
  { key: 'size', label: 'Taille', article: 'une taille' },
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

  // Merge approved categories with supplier's own pending category suggestions so the
  // supplier can create subcategories before the parent is approved — preserved exactly.
  const pendingCatSuggestions = suggestions.filter(s => s.type === 'category' && s.status === 'PENDING');
  const allCategoryOptions: Array<{ id: number; name: string; icon?: string | null }> = [
    ...cats,
    ...pendingCatSuggestions
      .filter(s => !cats.find(c => c.id === s.id))
      .map(s => ({ id: s.id, name: `${s.name} (En attente)`, icon: s.icon })),
  ];

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/supplier/catalog-suggestions", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] }); toast({ title: "Proposition envoyée", description: "Votre proposition est en attente de validation par l'administration." }); setDialogOpen(false); setForm(EMPTY_FORM); },
    onError: (err: any) => toast({ title: err?.message ?? "Erreur lors de l'envoi de la proposition", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ type, id, data }: { type: string; id: number; data: any }) =>
      apiRequest("PATCH", `/api/supplier/catalog-suggestions/${type}/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] }); toast({ title: "Proposition mise à jour" }); setDialogOpen(false); setEditing(null); setForm(EMPTY_FORM); },
    onError: () => toast({ title: "Erreur lors de la mise à jour", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: ({ type, id }: { type: string; id: number }) =>
      apiRequest("DELETE", `/api/supplier/catalog-suggestions/${type}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/supplier/catalog-suggestions"] }); toast({ title: "Proposition supprimée" }); setDeleteTarget(null); pagination.resetPage(); },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const activeTypeDef = SUGGESTION_TYPES.find(t => t.key === activeType)!;
  const filtered = suggestions.filter(s => s.type === activeType);

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [activeType, filtered.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageSuggestions = filtered.slice(pagination.start, pagination.end);

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
    if (!form.name.trim()) return toast({ title: "Le nom est requis", variant: "destructive" });
    if (activeType === 'subcategory' && !form.categoryId) return toast({ title: "La catégorie parente est requise", variant: "destructive" });
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
      {/* Stats — same bordered, shadow-none stat card style as Admin → Category Management */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><SendHorizonal className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold leading-none">{pendingCount}</p><p className="text-xs text-muted-foreground mt-0.5">En attente</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/30"><Check className="w-4 h-4 text-emerald-600" /></div>
            <div><p className="text-xl font-bold leading-none">{approvedCount}</p><p className="text-xs text-muted-foreground mt-0.5">Approuvées</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/30"><Layers className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold leading-none">{suggestions.length}</p><p className="text-xs text-muted-foreground mt-0.5">Total des demandes</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
        Proposez de nouveaux éléments du catalogue (catégories, sous-catégories, marques, saveurs ou tailles) pour validation par l'administration. Une fois approuvés, ils deviennent disponibles sur la marketplace.
        <br /><span className="opacity-80">Vous pouvez créer des sous-catégories sous une catégorie en attente — toute la hiérarchie sera examinée ensemble.</span>
      </div>

      {/* Type switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg border overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {SUGGESTION_TYPES.map(t => (
            <button key={t.key} onClick={() => setActiveType(t.key)} data-testid={`type-tab-${t.key}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${activeType === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t.label}
              {suggestions.filter(s => s.type === t.key).length > 0 && (
                <span className="ml-1.5 text-xs opacity-60">({suggestions.filter(s => s.type === t.key).length})</span>
              )}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openCreate} data-testid="button-create-suggestion" className="gap-1.5">
          <Plus className="w-4 h-4" />Proposer {activeTypeDef.article}
        </Button>
      </div>

      {/* Suggestions — card grid (Admin Category Management's own visual language),
          replacing the previous Table layout. */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Aucune proposition de {activeTypeDef.label.toLowerCase()} pour le moment.</p>
          <p className="text-xs mt-1">Cliquez sur « Proposer… » pour en soumettre une à l'administration.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pageSuggestions.map(s => (
            <CatalogSuggestionCard
              key={s.id}
              testId={`card-suggestion-${s.id}`}
              icon={s.icon}
              name={s.name}
              description={s.description}
              badges={<StatusBadge status={s.status} />}
              meta={
                activeType === 'subcategory'
                  ? `Catégorie parente : ${allCategoryOptions.find(c => c.id === (s as any).categoryId)?.name ?? '—'}`
                  : activeType === 'size' && (s as any).value
                    ? `Valeur / Unité : ${(s as any).value}`
                    : undefined
              }
              actions={s.status === 'PENDING' ? (
                <div className="flex gap-1.5 justify-end w-full">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(s)} data-testid={`button-edit-suggestion-${s.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)} data-testid={`button-delete-suggestion-${s.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ) : undefined}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={filtered.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="propositions"
        />
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditing(null); setForm(EMPTY_FORM); } }}>
        <DialogContent hideClose className="sm:max-w-md">
          <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => { setDialogOpen(false); setEditing(null); setForm(EMPTY_FORM); }} aria-label="Close" data-testid="button-close-suggestion-dialog">
            <X className="w-4 h-4" />
          </button>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la proposition" : `Proposer ${activeTypeDef.article}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Parent category (subcategory only) — includes supplier's own PENDING categories */}
            {activeType === 'subcategory' && (
              <div className="space-y-1.5">
                <Label>Catégorie parente *</Label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger data-testid="select-suggestion-category"><SelectValue placeholder="Sélectionnez une catégorie" /></SelectTrigger>
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
                    Les catégories marquées « (En attente) » sont vos propres propositions en attente d'approbation.
                  </p>
                )}
              </div>
            )}
            {/* Icon + Name */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Icône (emoji)</Label>
                <Input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="☕" className="text-center text-lg" data-testid="input-suggestion-icon" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Nom *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={`ex. ${activeType === 'flavor' ? 'Vanille' : activeType === 'size' ? 'Grand' : activeType === 'brand' ? 'Lavazza' : 'Nouvel élément'}`} data-testid="input-suggestion-name" />
              </div>
            </div>
            {/* Size value */}
            {activeType === 'size' && (
              <div className="space-y-1.5">
                <Label>Valeur / Unité</Label>
                <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="ex. 500ml, 1kg, Grand" data-testid="input-suggestion-value" />
              </div>
            )}
            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brève description (optionnel)" data-testid="input-suggestion-description" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || (activeType === 'subcategory' && !form.categoryId) || create.isPending || update.isPending} data-testid="button-save-suggestion">
                {(create.isPending || update.isPending) ? "Envoi en cours…" : editing ? "Enregistrer les modifications" : "Soumettre la proposition"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent hideClose className="sm:max-w-sm">
            <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => setDeleteTarget(null)} aria-label="Close" data-testid="button-close-delete-suggestion">
              <X className="w-4 h-4" />
            </button>
            <DialogHeader><DialogTitle>Supprimer « {deleteTarget.name} » ?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Cela supprimera définitivement votre proposition.</p>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
              <Button variant="destructive" onClick={() => remove.mutate({ type: deleteTarget.type, id: deleteTarget.id })} disabled={remove.isPending} data-testid="button-confirm-delete-suggestion">
                Supprimer
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
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Catégories"
        subtitle="Gérez vos catégories et proposez de nouveaux éléments du catalogue pour validation par l'administration."
        action={activeSection === 'my-categories' && (
          <Button onClick={() => setAddCategoryOpen(true)} data-testid="button-add-category" className="gap-2">
            <Plus className="w-4 h-4" />Ajouter une catégorie
          </Button>
        )}
      />

      {/* Section switcher — same visual/scrolling design as the Admin System Management
          switcher: hidden-scrollbar horizontal scroll on mobile, pill container, active tab
          in a bg-background/shadow-sm chip. */}
      <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
          <button onClick={() => setActiveSection('my-categories')} data-testid="tab-my-categories"
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${activeSection === 'my-categories' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Mes catégories
          </button>
          <button onClick={() => setActiveSection('category-requests')} data-testid="tab-category-requests"
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${activeSection === 'category-requests' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Demandes de catégories
          </button>
        </div>
      </div>

      {activeSection === 'my-categories' && <MyCategoriesSection modalOpen={addCategoryOpen} setModalOpen={setAddCategoryOpen} />}
      {activeSection === 'category-requests' && <CategoryRequestsSection />}
    </div>
  );
}
