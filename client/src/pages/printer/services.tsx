import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { PrintCatalogItem, PrintCategoryTaxonomy, PrintSubCategoryTaxonomy } from "@shared/schema";
import { printCategoryIcon, printSubCategoryIcon } from "@/lib/print-category-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Plus, Pencil, Trash2, Printer, X, Layers } from "lucide-react";
import { Link } from "wouter";
type FormState = {
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  subCategory: string;
  price: string; // decimal display value, converted to cents on submit
  unit: string;
  minQuantity: string;
  productionTimeDays: string;
  materials: string[];
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "", description: "", imageUrl: "", category: "", subCategory: "",
  price: "", unit: "unité", minQuantity: "1", productionTimeDays: "3",
  materials: [], isActive: true,
};

function toFormState(item: PrintCatalogItem): FormState {
  return {
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl ?? "",
    category: item.category,
    subCategory: item.subCategory,
    price: (item.priceInCents / 100).toString(),
    unit: item.unit,
    minQuantity: String(item.minQuantity),
    productionTimeDays: String(item.productionTimeDays),
    materials: item.materials ?? [],
    isActive: item.isActive,
  };
}

// ── Create/Edit form dialog ───────────────────────────────────────────────────

function ServiceFormDialog({
  open, onOpenChange, editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PrintCatalogItem | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [materialDraft, setMaterialDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Category/subcategory are constrained to what this Printer has selected in
  // the Catégories tab (itself constrained to the Admin's active taxonomy) —
  // never free text, so a service can never reference a category the server
  // would reject anyway (see the validatePrintTaxonomySelection check on
  // POST/PATCH /api/print/catalog).
  const { data: mapping } = useQuery<{ categories: string[]; subCategories: string[] }>({
    queryKey: ["/api/print/me/categories"], enabled: open,
  });
  const { data: taxonomy } = useQuery<{ categories: PrintCategoryTaxonomy[]; subcategories: PrintSubCategoryTaxonomy[] }>({
    queryKey: ["/api/print/taxonomy"], enabled: open,
  });
  const mappedCategories = mapping?.categories ?? [];
  const selectedCategoryTaxonomy = taxonomy?.categories.find((c) => c.name === form.category);
  const subCategoryOptions = (taxonomy?.subcategories ?? [])
    .filter((s) => s.categoryId === selectedCategoryTaxonomy?.id && (mapping?.subCategories ?? []).includes(s.name))
    .map((s) => s.name);

  useEffect(() => {
    setForm(editing ? toFormState(editing) : EMPTY_FORM);
    setErrors({});
    setMaterialDraft("");
  }, [editing, open]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Nom requis";
    if (!form.category.trim()) e.category = "Catégorie requise";
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum < 0) e.price = "Prix invalide";
    const minQty = parseInt(form.minQuantity, 10);
    if (isNaN(minQty) || minQty < 1) e.minQuantity = "Quantité minimum invalide";
    const days = parseInt(form.productionTimeDays, 10);
    if (isNaN(days) || days < 0) e.productionTimeDays = "Délai invalide";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    imageUrl: form.imageUrl.trim() || null,
    category: form.category.trim(),
    subCategory: form.subCategory.trim(),
    priceInCents: Math.round(parseFloat(form.price) * 100),
    unit: form.unit.trim() || "unité",
    minQuantity: parseInt(form.minQuantity, 10),
    productionTimeDays: parseInt(form.productionTimeDays, 10),
    materials: form.materials,
    isActive: form.isActive,
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/print/catalog", buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print/catalog"] });
      toast({ title: "Service créé", description: `${form.name} a été ajouté au catalogue.` });
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/print/catalog/${editing!.id}`, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print/catalog"] });
      toast({ title: "Service mis à jour" });
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const submit = () => {
    if (!validate()) return;
    if (editing) updateMutation.mutate();
    else createMutation.mutate();
  };

  const addMaterial = () => {
    if (!materialDraft.trim()) return;
    setForm((f) => ({ ...f, materials: [...f.materials, materialDraft.trim()] }));
    setMaterialDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le service" : "Ajouter un service"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Nom du service *</Label>
            <Input data-testid="input-service-name" value={form.name} onChange={set("name")} placeholder="ex: Flyers A5" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={set("description")} rows={3} placeholder="Détails du service…" />
          </div>
          <div className="space-y-1.5">
            <Label>Image (URL)</Label>
            <Input type="url" value={form.imageUrl} onChange={set("imageUrl")} placeholder="https://…" />
          </div>
          {mappedCategories.length === 0 ? (
            <div className="rounded-xl border border-amber-300/50 bg-amber-500/5 p-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Sélectionnez d'abord au moins une catégorie dans l'onglet Catégories pour pouvoir créer un service.
              </p>
              <Link href="/printer/categories">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0">
                  <Layers className="w-3.5 h-3.5" /> Catégories
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Catégorie *</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v, subCategory: "" }))}>
                  <SelectTrigger data-testid="input-service-category"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>{mappedCategories.map((c) => {
                    const t = taxonomy?.categories.find((tc) => tc.name === c);
                    return <SelectItem key={c} value={c}>{printCategoryIcon(c, t?.icon)} {c}</SelectItem>;
                  })}</SelectContent>
                </Select>
                {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Sous-catégorie</Label>
                <Select value={form.subCategory || undefined} onValueChange={(v) => setForm((f) => ({ ...f, subCategory: v }))} disabled={!form.category || subCategoryOptions.length === 0}>
                  <SelectTrigger><SelectValue placeholder={subCategoryOptions.length === 0 ? "Aucune" : "Choisir…"} /></SelectTrigger>
                  <SelectContent>{subCategoryOptions.map((s) => {
                    const t = taxonomy?.subcategories.find((ts) => ts.name === s);
                    return <SelectItem key={s} value={s}>{printSubCategoryIcon(s, t?.icon)} {s}</SelectItem>;
                  })}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Prix *</Label>
              <Input type="number" min="0" step="0.01" data-testid="input-service-price" value={form.price} onChange={set("price")} />
              {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Unité</Label>
              <Input value={form.unit} onChange={set("unit")} placeholder="unité, lot, m²…" />
            </div>
            <div className="space-y-1.5">
              <Label>Qté minimum</Label>
              <Input type="number" min="1" value={form.minQuantity} onChange={set("minQuantity")} />
              {errors.minQuantity && <p className="text-xs text-destructive">{errors.minQuantity}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Délai de production (jours)</Label>
            <Input type="number" min="0" className="max-w-[140px]" value={form.productionTimeDays} onChange={set("productionTimeDays")} />
            {errors.productionTimeDays && <p className="text-xs text-destructive">{errors.productionTimeDays}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Matériaux</Label>
            <div className="flex gap-2">
              <Input
                value={materialDraft}
                onChange={(e) => setMaterialDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }}
                placeholder="ex: Papier couché 300g"
              />
              <Button type="button" variant="outline" className="shrink-0" disabled={!materialDraft.trim()} onClick={addMaterial}>Ajouter</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.materials.map((m, i) => (
                <span key={`${m}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-2.5 py-1 text-xs">
                  {m}
                  <button type="button" aria-label={`Supprimer ${m}`} onClick={() => setForm((f) => ({ ...f, materials: f.materials.filter((_, idx) => idx !== i) }))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Actif</p>
              <p className="text-xs text-muted-foreground">Visible dans la marketplace pour les Coffee Owners</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button data-testid="button-save-service" onClick={submit} disabled={saving || mappedCategories.length === 0}>
            {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PrinterServices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fmt = useFormatCurrency();

  const { data: catalog = [], isLoading } = useQuery<PrintCatalogItem[]>({ queryKey: ["/api/print/catalog"] });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PrintCatalogItem | null>(null);
  const [deleting, setDeleting] = useState<PrintCatalogItem | null>(null);

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/print/catalog/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/print/catalog"] }),
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/print/catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print/catalog"] });
      toast({ title: "Service supprimé" });
      setDeleting(null);
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (item: PrintCatalogItem) => { setEditing(item); setFormOpen(true); };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez vos prix, quantités minimums, délais et catégories.</p>
        </div>
        <Button data-testid="button-add-service" className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Ajouter un service
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : catalog.length === 0 ? (
        <EmptyState message="Aucun service pour le moment. Ajoutez votre premier service ci-dessus." icon={Printer} />
      ) : (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Prix</TableHead>
                <TableHead>Qté min.</TableHead>
                <TableHead>Délai</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.map((item) => (
                <TableRow key={item.id} data-testid={`row-service-${item.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-9 h-9 rounded-lg object-cover shrink-0 bg-secondary" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Printer className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.unit}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {printCategoryIcon(item.category)} {item.category}{item.subCategory ? ` · ${item.subCategory}` : ""}
                  </TableCell>
                  <TableCell className="font-semibold text-sm">{fmt(item.priceInCents)}</TableCell>
                  <TableCell className="text-sm">{item.minQuantity}</TableCell>
                  <TableCell className="text-sm">{item.productionTimeDays} j</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.isActive}
                        onCheckedChange={(v) => toggleActiveMutation.mutate({ id: item.id, isActive: v })}
                        aria-label={item.isActive ? "Désactiver" : "Activer"}
                      />
                      <Badge variant="outline" className={item.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-muted-foreground"}>
                        {item.isActive ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} data-testid={`button-edit-service-${item.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleting(item)} data-testid={`button-delete-service-${item.id}`}>
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

      <ServiceFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      <Dialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Supprimer "{deleting?.name}" ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est définitive et retirera ce service de votre catalogue et de la marketplace.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Annuler</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
              {deleteMutation.isPending ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
