import { useEffect, useState } from "react";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Layers, Check, MousePointerClick, Save } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useToast } from "@/hooks/use-toast";
import {
  useMarketingTaxonomy, useMarketingSubCategoryTaxonomy,
  useMyMarketingCategoryMapping, useUpdateMarketingCategoryMapping,
} from "@/hooks/use-marketing";
import { resolveMarketingCategoryIcon, resolveMarketingSubCategoryIcon } from "@/lib/marketing-category-icon";

// Categories & Subcategories: Complete End-to-End Integration — Business →
// Catégories, mirroring Espace Imprimerie → Business → Catégories
// (pages/printer/categories.tsx) exactly: same card list / stats / pagination /
// selection interaction, adapted to Marketing's own independent taxonomy
// (marketingCategoryTaxonomy/marketingSubCategoryTaxonomy — never PRINT's
// tables or data). The Admin-controlled taxonomy (admin/marketing-page.tsx's
// "Catégories de services" tab) is the single source of truth for which
// categories/subcategories exist at all — an agency can only select from what's
// active here, never type an arbitrary value. Selecting here is what makes a
// category/subcategory usable on "Nouveau service" (services.tsx).
export default function MarketingCategoriesPage() {
  const { toast } = useToast();
  const { data: categories = [], isLoading: categoriesLoading } = useMarketingTaxonomy();
  const { data: subcategories = [], isLoading: subcategoriesLoading } = useMarketingSubCategoryTaxonomy();
  const { data: mapping, isLoading: mappingLoading } = useMyMarketingCategoryMapping();
  const save = useUpdateMarketingCategoryMapping();

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

  const toggleCategory = (name: string) => {
    setDirty(true);
    setSelectedCategories((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
    if (selectedCategories.includes(name)) {
      // Unselecting a category also drops any of its subcategories that were selected.
      const cat = categories.find((c) => c.name === name);
      const subNamesForCat = new Set(subcategories.filter((s) => s.categoryId === cat?.id).map((s) => s.name));
      setSelectedSubCategories((prev) => prev.filter((s) => !subNamesForCat.has(s)));
    }
  };

  const toggleSubCategory = (name: string) => {
    setDirty(true);
    setSelectedSubCategories((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };

  const handleSave = () => {
    save.mutate({ categories: selectedCategories, subCategories: selectedSubCategories }, {
      onSuccess: () => { setDirty(false); toast({ title: "Catégories mises à jour" }); },
      onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer.", variant: "destructive" }),
    });
  };

  const isLoading = categoriesLoading || subcategoriesLoading || mappingLoading;

  // Same 3-stat row as Espace Imprimerie's own Catégories page (Selected /
  // Sub-categories active / Available) — presentation only, no new data source.
  const pagination = usePagination(categories.length);
  useEffect(() => { pagination.resetPage(); }, [categories.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageCategories = categories.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Catégories"
        subtitle="Sélectionnez les catégories de services gérées par l'administrateur qui correspondent à votre activité."
        icon={Layers}
        gradientClass="bg-gradient-to-br from-fuchsia-500/10 via-fuchsia-500/5 to-transparent border-fuchsia-500/20"
        iconBgClass="bg-fuchsia-500/15"
        iconTextClass="text-fuchsia-600 dark:text-fuchsia-400"
        action={
          <Button onClick={handleSave} disabled={!dirty || save.isPending} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" data-testid="button-save-marketing-categories">
            <Save className="w-4 h-4 mr-1.5" />{save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-fuchsia-50 dark:bg-fuchsia-950/30"><Layers className="w-4 h-4 text-fuchsia-600" /></div>
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
        <div className="rounded-lg bg-fuchsia-50 dark:bg-fuchsia-950/20 border border-fuchsia-200 dark:border-fuchsia-800 px-4 py-2.5 text-sm text-fuchsia-700 dark:text-fuchsia-300 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 flex-shrink-0" />
          Cochez une catégorie pour afficher ses sous-catégories, puis cliquez sur "Enregistrer" pour confirmer votre sélection.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : categories.length === 0 ? (
        <EmptyState message="Aucune catégorie de services n'a encore été créée par l'administrateur." icon={Layers} />
      ) : (
        <div className="space-y-4">
          {pageCategories.map((category) => {
            const checked = selectedCategories.includes(category.name);
            const subs = subcategories.filter((s) => s.categoryId === category.id);
            const selectedSubCount = subs.filter((s) => selectedSubCategories.includes(s.name)).length;
            return (
              <Card
                key={category.id}
                className={`overflow-hidden transition-all ${checked ? "ring-1 ring-fuchsia-500 shadow-sm border-fuchsia-500/40" : "hover:border-fuchsia-500/30"}`}
                data-testid={`card-marketing-category-${category.id}`}
              >
                <div className="p-4 pb-0">
                  <label className="flex items-center gap-3 cursor-pointer select-none" data-testid={`row-marketing-category-${category.id}`}>
                    <Checkbox checked={checked} onCheckedChange={() => toggleCategory(category.name)} data-testid={`checkbox-marketing-category-${category.id}`} />
                    <span className="text-2xl">{resolveMarketingCategoryIcon(category.name, categories)}</span>
                    <div>
                      <p className="font-semibold text-base">{category.name}</p>
                      {subs.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{selectedSubCount} / {subs.length} sous-catégories sélectionnées</p>}
                    </div>
                  </label>
                </div>
                {checked && (
                  <CardContent className="pt-4">
                    {subs.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Aucune sous-catégorie définie pour le moment.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {subs.map((sub) => {
                          const subChecked = selectedSubCategories.includes(sub.name);
                          return (
                            <div
                              key={sub.id}
                              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${subChecked ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-border"}`}
                              data-testid={`subcat-item-marketing-${sub.id}`}
                            >
                              <Checkbox
                                checked={subChecked}
                                onCheckedChange={() => toggleSubCategory(sub.name)}
                                data-testid={`checkbox-marketing-subcat-${sub.id}`}
                              />
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left cursor-pointer"
                                onClick={() => toggleSubCategory(sub.name)}
                                data-testid={`button-select-marketing-subcat-${sub.id}`}
                              >
                                <p className="text-sm font-medium truncate">{resolveMarketingSubCategoryIcon(sub.name, subcategories)} {sub.name}</p>
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

      <Card className="rounded-2xl bg-fuchsia-500/5 border-fuchsia-500/20">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400 mb-1.5">Sélectionné par mon agence</p>
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
