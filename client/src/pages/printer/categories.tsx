import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Layers, Check, MousePointerClick, Save } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import type { PrintCategoryTaxonomy, PrintSubCategoryTaxonomy } from "@shared/schema";
import { printCategoryIcon, printSubCategoryIcon } from "@/lib/print-category-icons";

// The Admin-controlled PRINT taxonomy (client/src/pages/admin/print-page.tsx's
// "Catégories" tab manages the same printCategoryTaxonomy/printSubCategoryTaxonomy
// tables) is the single source of truth for which categories/subcategories exist
// at all — a Printer can only select from what's active here, never type an
// arbitrary value. Selecting here is what makes a category usable on the
// "Ajouter un service" form (services.tsx) and, once an active service actually
// uses it, what makes it appear on the Coffee Owner's /print marketplace.
//
// Visual presentation only (card list / stats / pagination) now mirrors
// Supplier → Categories → My Categories (pages/supplier/categories-page.tsx) per
// the "Redesign Espace Imprimerie Categories Page" task — the underlying
// selection model stays exactly what it was: a direct multi-select (no per-
// category approval/freeze/remove workflow, no "add category" modal — those are
// Supplier-specific concepts this account never had), persisted by one
// PATCH /api/print/me/categories call via the existing "Enregistrer" button.
export default function PrinterCategoriesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: taxonomy, isLoading: taxonomyLoading } = useQuery<{
    categories: PrintCategoryTaxonomy[];
    subcategories: PrintSubCategoryTaxonomy[];
  }>({ queryKey: ["/api/print/taxonomy"] });

  const { data: mapping, isLoading: mappingLoading } = useQuery<{ categories: string[]; subCategories: string[] }>({
    queryKey: ["/api/print/me/categories"],
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  // Seed local editable state from the server once it arrives; re-seed only
  // when not mid-edit, so a realtime refresh never clobbers unsaved changes.
  useEffect(() => {
    if (mapping && !dirty) {
      setSelectedCategories(mapping.categories);
      setSelectedSubCategories(mapping.subCategories);
    }
  }, [mapping, dirty]);

  const categories = taxonomy?.categories ?? [];
  const subcategories = taxonomy?.subcategories ?? [];
  const categoryByName = new Map(categories.map((c) => [c.name, c] as const));

  const toggleCategory = (name: string) => {
    setDirty(true);
    setSelectedCategories((prev) => {
      const next = prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name];
      return next;
    });
    if (selectedCategories.includes(name)) {
      // Unselecting a category also drops any of its subcategories that were selected.
      const cat = categoryByName.get(name);
      const subNamesForCat = new Set(subcategories.filter((s) => s.categoryId === cat?.id).map((s) => s.name));
      setSelectedSubCategories((prev) => prev.filter((s) => !subNamesForCat.has(s)));
    }
  };

  const toggleSubCategory = (name: string) => {
    setDirty(true);
    setSelectedSubCategories((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/print/me/categories", { categories: selectedCategories, subCategories: selectedSubCategories }),
    onSuccess: (data: any) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/print/me/categories"] });
      qc.invalidateQueries({ queryKey: ["/api/print/taxonomy"] });
      toast({ title: "Catégories mises à jour" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer.", variant: "destructive" }),
  });

  const isLoading = taxonomyLoading || mappingLoading;

  // Same 3-stat row as Supplier's My Categories (Selected / Sub-categories active /
  // Available), same Card/icon-chip styling — presentation only, no new data source.
  const pagination = usePagination(categories.length);
  useEffect(() => { pagination.resetPage(); }, [categories.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageCategories = categories.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Catégories"
        subtitle="Sélectionnez les catégories PRINT gérées par l'administrateur qui correspondent à votre activité."
        icon={Layers}
        gradientClass="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20"
        iconBgClass="bg-blue-500/15"
        iconTextClass="text-blue-600 dark:text-blue-400"
        action={
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="button-save-print-categories">
            <Save className="w-4 h-4 mr-1.5" />{save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950/30"><Layers className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold leading-none">{selectedCategories.length}</p><p className="text-xs text-muted-foreground mt-0.5">Catégories sélectionnées</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-purple-50 dark:bg-purple-950/30"><Check className="w-4 h-4 text-purple-600" /></div>
            <div><p className="text-xl font-bold leading-none">{selectedSubCategories.length}</p><p className="text-xs text-muted-foreground mt-0.5">Sous-catégories actives</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><Layers className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold leading-none">{categories.length}</p><p className="text-xs text-muted-foreground mt-0.5">Disponibles</p></div>
          </CardContent>
        </Card>
      </div>

      {categories.length > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 flex-shrink-0" />
          Cochez une catégorie pour afficher ses sous-catégories, puis cliquez sur "Enregistrer" pour confirmer votre sélection.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : categories.length === 0 ? (
        <EmptyState message="Aucune catégorie PRINT n'a encore été créée par l'administrateur." icon={Layers} />
      ) : (
        <div className="space-y-4">
          {pageCategories.map((category) => {
            const checked = selectedCategories.includes(category.name);
            const subs = subcategories.filter((s) => s.categoryId === category.id);
            const selectedSubCount = subs.filter((s) => selectedSubCategories.includes(s.name)).length;
            return (
              <Card
                key={category.id}
                className={`overflow-hidden transition-all ${checked ? "ring-1 ring-primary shadow-sm border-primary/40" : "hover:border-primary/30"}`}
                data-testid={`card-printer-category-${category.id}`}
              >
                <div className="p-4 pb-0">
                  <label className="flex items-center gap-3 cursor-pointer select-none" data-testid={`row-printer-category-${category.id}`}>
                    <Checkbox checked={checked} onCheckedChange={() => toggleCategory(category.name)} data-testid={`checkbox-category-${category.id}`} />
                    <span className="text-2xl">{printCategoryIcon(category.name, category.icon)}</span>
                    <div>
                      <p className="font-semibold text-base">{category.name}</p>
                      {subs.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{selectedSubCount} of {subs.length} sub-categories selected</p>}
                    </div>
                  </label>
                </div>
                {checked && (
                  <CardContent className="pt-4">
                    {subs.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No sub-categories defined yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {subs.map((sub) => {
                          const subChecked = selectedSubCategories.includes(sub.name);
                          return (
                            <div
                              key={sub.id}
                              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${subChecked ? "border-primary/40 bg-primary/5" : "border-border"}`}
                              data-testid={`subcat-item-${sub.id}`}
                            >
                              <Checkbox
                                checked={subChecked}
                                onCheckedChange={() => toggleSubCategory(sub.name)}
                                data-testid={`checkbox-subcat-${sub.id}`}
                              />
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left cursor-pointer"
                                onClick={() => toggleSubCategory(sub.name)}
                                data-testid={`button-select-subcat-${sub.id}`}
                              >
                                <p className="text-sm font-medium truncate">{printSubCategoryIcon(sub.name, sub.icon)} {sub.name}</p>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={categories.length}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="catégories"
          />
        </div>
      )}

      <Card className="rounded-2xl bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">Sélectionné par mon compte Imprimerie</p>
          {selectedCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune catégorie sélectionnée — vous ne pourrez pas créer de service tant qu'aucune catégorie n'est choisie.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedCategories.join(", ")}
              {selectedSubCategories.length > 0 && ` · ${selectedSubCategories.join(", ")}`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
