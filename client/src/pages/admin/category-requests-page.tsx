import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, Search, Tag, Clock, User, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  phone?: string;
  categories?: string[];
  printCategories?: string[];
  marketingCategories?: string[];
  governorates?: string[];
  billingInfo?: Record<string, any>;
}

interface SupplierMappingEntry {
  user: { id: number; name: string; email: string; role: string; status: string };
  mappings: { category: { id: number; name: string } }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  SUPPLIER:            "Fournisseur",
  PRINTER:             "Imprimerie",
  MARKETING:           "Marketing",
  BARISTA_ACADEMY:     "Barista Academy",
  BARISTA_MARKETPLACE: "Barista Marketplace",
  CAFE_OWNER:          "Café",
  DELIVERY_COMPANY:    "Livraison",
};

const CATEGORY_ROLES = ["SUPPLIER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE", "DELIVERY_COMPANY"];

function getLegacyCategories(u: UserRow): string[] {
  if (u.role === "PRINTER")  return u.printCategories ?? [];
  if (u.role === "MARKETING") return u.marketingCategories ?? [];
  if (u.role === "DELIVERY_COMPANY") return u.governorates ?? [];
  return u.categories ?? [];
}

function getCategoryFieldLabel(role: string): string {
  if (role === "PRINTER")  return "Catégories d'impression";
  if (role === "MARKETING") return "Spécialités marketing";
  if (role === "DELIVERY_COMPANY") return "Gouvernorats desservis";
  if (role === "SUPPLIER") return "Catégories produits";
  if (role === "BARISTA_ACADEMY" || role === "BARISTA_MARKETPLACE") return "Spécialités barista";
  return "Catégories";
}

function getRoleBadgeColor(role: string) {
  const map: Record<string, string> = {
    SUPPLIER:            "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    PRINTER:             "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    MARKETING:           "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    BARISTA_ACADEMY:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    BARISTA_MARKETPLACE: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    CAFE_OWNER:          "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    DELIVERY_COMPANY:    "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  };
  return map[role] ?? "bg-secondary text-secondary-foreground";
}

// ── Category Update Modal (non-supplier roles) ────────────────────────────────

const PRESET_CATEGORIES: Record<string, string[]> = {
  PRINTER:             ["Flyers","Menus","Cartes de visite","Affiches","Enseignes","Packaging","Étiquettes","Banderoles","Gobelets","Kakémonos"],
  MARKETING:           ["Réseaux sociaux","Vidéo","Photographie","SEO","Publicité","Branding","Site web","Influence","Email marketing","Événementiel"],
  BARISTA_ACADEMY:     ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"],
  BARISTA_MARKETPLACE: ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"],
};

function CategoryEditModal({ user, open, onClose }: { user: UserRow; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const presets = PRESET_CATEGORIES[user.role] ?? [];
  const current = getLegacyCategories(user);
  const [selected, setSelected] = useState<string[]>(current);
  const [saving, setSaving] = useState(false);

  const toggle = (cat: string) => setSelected((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {};
      if (user.role === "PRINTER") payload.printCategories = selected;
      else if (user.role === "MARKETING") payload.marketingCategories = selected;
      else payload.categories = selected;
      await apiRequest("PATCH", `/api/admin/users/${user.id}/categories`, payload);
      await qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Catégories mises à jour", description: `${selected.length} catégorie(s) assignée(s) à ${user.name}.` });
      onClose();
    } catch {
      toast({ title: "Erreur", description: "Impossible de mettre à jour les catégories.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4" /> Modifier les catégories — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((cat) => (
              <button
                key={cat}
                type="button"
                data-testid={`cat-toggle-${cat}`}
                onClick={() => toggle(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selected.includes(cat)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border/40 hover:border-primary/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">{selected.length} catégorie(s) sélectionnée(s) : {selected.join(", ")}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-categories">
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Supplier Category Edit Modal ───────────────────────────────────────────────

function SupplierCategoryEditModal({
  user,
  catalogCats,
  currentCatIds,
  open,
  onClose,
}: {
  user: { id: number; name: string };
  catalogCats: { id: number; name: string; icon?: string | null }[];
  currentCatIds: number[];
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>(currentCatIds);
  const [saving, setSaving] = useState(false);

  const toggle = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/admin/supplier-mappings/${user.id}`, { categoryIds: selectedIds });
      await qc.invalidateQueries({ queryKey: ["/api/admin/supplier-mappings"] });
      toast({ title: "Catégories mises à jour", description: `${selectedIds.length} catégorie(s) assignée(s) à ${user.name}.` });
      onClose();
    } catch {
      toast({ title: "Erreur", description: "Impossible de mettre à jour les catégories.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4" /> Modifier les catégories — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">Sélectionnez les catégories du catalogue à assigner à ce fournisseur.</p>
          <div className="flex flex-wrap gap-2">
            {catalogCats.length === 0 && <p className="text-sm text-muted-foreground">Aucune catégorie dans le catalogue.</p>}
            {catalogCats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggle(cat.id)}
                data-testid={`cat-toggle-${cat.id}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                  selectedIds.includes(cat.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border/40 hover:border-primary/40"
                }`}
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>
          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">{selectedIds.length} catégorie(s) sélectionnée(s)</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" onClick={save} disabled={saving} data-testid="button-save-categories">
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CategoryRequestsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: supplierMappings = [], isLoading: mappingsLoading } = useQuery<SupplierMappingEntry[]>({
    queryKey: ["/api/admin/supplier-mappings"],
  });

  const { data: catalogCats = [] } = useQuery<{ id: number; name: string; icon?: string | null }[]>({
    queryKey: ["/api/categories"],
  });

  const isLoading = usersLoading || mappingsLoading;

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

  // Compute display categories for a user. Suppliers use the DB mapping table; others use legacy profile fields.
  const getDisplayCategories = (u: UserRow): string[] => {
    if (u.role === "SUPPLIER") {
      const entry = supplierMappings.find((e) => e.user?.id === u.id);
      return entry?.mappings?.map((m) => m.category?.name ?? "").filter(Boolean) ?? [];
    }
    return getLegacyCategories(u);
  };

  const getSupplierCatIds = (u: UserRow): number[] => {
    const entry = supplierMappings.find((e) => e.user?.id === u.id);
    return entry?.mappings?.map((m) => m.category?.id).filter(Boolean) ?? [];
  };

  // Show all SUPPLIER users (even with no categories yet) plus other roles only if they have categories
  const usersToShow = (allUsers as UserRow[]).filter((u) => {
    if (!CATEGORY_ROLES.includes(u.role)) return false;
    if (u.role === "SUPPLIER") return true;
    return getLegacyCategories(u).length > 0;
  });

  let filtered = usersToShow;
  if (roleFilter !== "all") filtered = filtered.filter((u) => u.role === roleFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }

  const pendingCount = usersToShow.filter((u) => u.status === "pending").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Demandes de catégories</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catégories sélectionnées par les prestataires.</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-sm px-3 py-1">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            {pendingCount} en attente
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {CATEGORY_ROLES.map((role) => {
          const count = usersToShow.filter((u) => u.role === role).length;
          return (
            <Card key={role} data-testid={`stat-${role}`}>
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ROLE_LABELS[role]}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-search"
            className="pl-9 rounded-xl"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-52 rounded-xl" data-testid="select-role-filter">
            <SelectValue placeholder="Tous les rôles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            {CATEGORY_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4" /> Prestataires avec catégories ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucun résultat trouvé.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filtered.map((u) => {
                const displayCats = getDisplayCategories(u);
                return (
                  <div key={u.id} className="flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors" data-testid={`row-user-${u.id}`}>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {u.role === "CAFE_OWNER" ? <User className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(u.role)}`}>{ROLE_LABELS[u.role]}</span>
                        {u.status === "pending" && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <Clock className="w-3 h-3 inline mr-0.5" />En attente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                      {displayCats.length > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground mt-1.5 font-medium">{getCategoryFieldLabel(u.role)} :</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {displayCats.slice(0, 5).map((cat) => (
                              <span key={cat} className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-full">{cat}</span>
                            ))}
                            {displayCats.length > 5 && <span className="text-xs text-muted-foreground self-center">+{displayCats.length - 5}</span>}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 mt-1 italic">
                          {u.role === "SUPPLIER" ? "Aucune catégorie sélectionnée dans My Categories" : "Aucune catégorie déclarée"}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-xs"
                        onClick={() => setEditUser(u)}
                        data-testid={`button-edit-cats-${u.id}`}
                      >
                        <Tag className="w-3.5 h-3.5 mr-1" />Modifier
                      </Button>
                      {u.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => approveMutation.mutate(u.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-${u.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />Approuver
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-xl text-xs"
                            onClick={() => rejectMutation.mutate(u.id)}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-reject-${u.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />Rejeter
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {editUser && editUser.role === "SUPPLIER" ? (
        <SupplierCategoryEditModal
          user={editUser}
          catalogCats={catalogCats}
          currentCatIds={getSupplierCatIds(editUser)}
          open={!!editUser}
          onClose={() => setEditUser(null)}
        />
      ) : editUser ? (
        <CategoryEditModal user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
      ) : null}
    </div>
  );
}
