import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Layers, Save } from "lucide-react";
import type { PrintCategoryTaxonomy, PrintSubCategoryTaxonomy } from "@shared/schema";
import { printCategoryIcon, printSubCategoryIcon } from "@/lib/print-category-icons";

// The Admin-controlled PRINT taxonomy (client/src/pages/admin/print-page.tsx's
// "Catégories" tab manages the same printCategoryTaxonomy/printSubCategoryTaxonomy
// tables) is the single source of truth for which categories/subcategories exist
// at all — a Printer can only select from what's active here, never type an
// arbitrary value. Selecting here is what makes a category usable on the
// "Ajouter un service" form (services.tsx) and, once an active service actually
// uses it, what makes it appear on the Coffee Owner's /print marketplace.
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catégories</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sélectionnez les catégories PRINT gérées par l'administrateur qui correspondent à votre activité.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="button-save-print-categories">
          <Save className="w-4 h-4 mr-1.5" />{save.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />Catégories disponibles (gérées par l'administrateur)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : categories.length === 0 ? (
            <EmptyState message="Aucune catégorie PRINT n'a encore été créée par l'administrateur." icon={Layers} />
          ) : (
            <div className="space-y-1">
              {categories.map((category) => {
                const checked = selectedCategories.includes(category.name);
                const subs = subcategories.filter((s) => s.categoryId === category.id);
                return (
                  <div key={category.id} className="rounded-xl border border-border/50 p-3" data-testid={`row-printer-category-${category.id}`}>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <Checkbox checked={checked} onCheckedChange={() => toggleCategory(category.name)} data-testid={`checkbox-category-${category.id}`} />
                      <span className="text-sm font-medium">{printCategoryIcon(category.name, category.icon)} {category.name}</span>
                    </label>
                    {checked && subs.length > 0 && (
                      <div className="mt-2.5 ml-6 flex flex-wrap gap-2">
                        {subs.map((sub) => {
                          const subChecked = selectedSubCategories.includes(sub.name);
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => toggleSubCategory(sub.name)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                subChecked ? "bg-blue-600 text-white border-blue-600" : "bg-background border-border/50 hover:border-blue-400"
                              }`}
                              data-testid={`chip-subcategory-${sub.id}`}
                            >
                              {printSubCategoryIcon(sub.name, sub.icon)} {sub.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
