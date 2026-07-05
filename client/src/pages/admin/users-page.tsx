import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserCheck, ShieldCheck, Plus, CheckCircle, XCircle, Clock,
  Filter, Trash2, Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

// ── Constants ──────────────────────────────────────────────────────────────────

const TUNISIAN_GOVERNORATES = [
  "Ariana","Béja","Ben Arous","Bizerte","Gabès","Gafsa","Jendouba","Kairouan",
  "Kasserine","Kébili","Le Kef","Mahdia","La Manouba","Médenine","Monastir",
  "Nabeul","Sfax","Sidi Bouzid","Siliana","Sousse","Tataouine","Tozeur","Tunis","Zaghouan"
];
const PRINT_CATS = ["Flyers","Menus","Cartes de visite","Affiches","Enseignes","Packaging","Étiquettes","Banderoles","Gobelets","Kakémonos"];
const MARKETING_CATS = ["Réseaux sociaux","Vidéo","Photographie","SEO","Publicité","Branding","Site web","Influence","Email marketing","Événementiel"];
const BARISTA_SPECIALTIES = ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"];

// ── Styling helpers ────────────────────────────────────────────────────────────

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SUPPLIER: "bg-amber-400 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CAFE_OWNER: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  DELIVERY_COMPANY: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  DRIVER: "bg-pink-300 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  PRINTER: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MARKETING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  BARISTA_ACADEMY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  BARISTA_MARKETPLACE: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  approved: { label: "Approuvé", className: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle },
  pending: { label: "En attente", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  rejected: { label: "Rejeté", className: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

const ALL_ROLES = [
  "SUPER_ADMIN", "ADMIN", "SUPPLIER", "CAFE_OWNER", "DELIVERY_COMPANY",
  "DRIVER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE"
];
const REGISTERABLE_ROLES = ["CAFE_OWNER", "SUPPLIER", "DELIVERY_COMPANY", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE"];
const APPROVABLE_ROLES = ["CAFE_OWNER", "SUPPLIER", "DELIVERY_COMPANY", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE"];

// ── MultiChip inline multi-select ─────────────────────────────────────────────

function MultiChip({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt));
    else onChange([...selected, opt]);
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg border bg-background max-h-28 overflow-y-auto">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
              selected.includes(opt)
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {selected.length > 0 && <p className="text-xs text-muted-foreground">{selected.length} sélectionné(s)</p>}
    </div>
  );
}

// ── User Detail Dialog ─────────────────────────────────────────────────────────

function UserDetailDialog({
  user, open, onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", locationAddress: "",
    governorates: [] as string[],
    printCategories: [] as string[],
    marketingCategories: [] as string[],
    categories: [] as string[],
  });

  useEffect(() => {
    if (user) {
      const u = user as any;
      setForm({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: u.phone ?? "",
        locationAddress: u.locationAddress ?? "",
        governorates: u.governorates ?? [],
        printCategories: u.printCategories ?? [],
        marketingCategories: u.marketingCategories ?? [],
        categories: u.categories ?? [],
      });
      setConfirmDelete(false);
    }
  }, [user]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/users"] });

  const statusMutation = useMutation({
    mutationFn: ({ status }: { status: string }) =>
      apiRequest("PATCH", `/api/admin/users/${user!.id}/status`, { status }),
    onSuccess: (_, { status }) => {
      invalidate();
      toast({ title: status === "approved" ? "Compte approuvé" : status === "rejected" ? "Compte rejeté" : "Statut mis à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/admin/users/${user!.id}`, data),
    onSuccess: () => { invalidate(); toast({ title: "Informations mises à jour" }); },
    onError: () => toast({ title: "Erreur lors de la mise à jour", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/users/${user!.id}`),
    onSuccess: () => { invalidate(); toast({ title: "Utilisateur supprimé" }); onClose(); },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Nom et email requis", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      locationAddress: form.locationAddress.trim() || null,
      governorates: form.governorates.length > 0 ? form.governorates : null,
      printCategories: form.printCategories.length > 0 ? form.printCategories : null,
      marketingCategories: form.marketingCategories.length > 0 ? form.marketingCategories : null,
      categories: form.categories.length > 0 ? form.categories : null,
    });
  };

  if (!user) return null;
  const u = user as any;
  const userStatus = u.status ?? "approved";
  const sc = statusConfig[userStatus] ?? statusConfig.approved;
  const StatusIcon = sc.icon;
  const canApprove = APPROVABLE_ROLES.includes(user.role);
  const isPending = statusMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setConfirmDelete(false); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{user.name}</span>
            <Badge variant="secondary" className={`${roleColors[user.role] || ""} text-xs`}>
              {user.role.replace(/_/g, " ")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Status bar */}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-secondary/30">
            <div className="flex items-center gap-2 text-sm">
              <StatusIcon className="w-4 h-4" />
              <span className="font-medium">{sc.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {u.createdAt ? `Inscrit le ${new Date(u.createdAt).toLocaleDateString("fr-FR")}` : ""}
            </p>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nom complet</Label>
              <Input data-testid="input-detail-name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input data-testid="input-detail-email" type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemple.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input data-testid="input-detail-phone" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+216 xx xxx xxx" />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input data-testid="input-detail-location" value={form.locationAddress}
                onChange={e => setForm(f => ({ ...f, locationAddress: e.target.value }))} placeholder="Adresse complète" />
            </div>
          </div>

          {/* Role-specific multi-selects */}
          {user.role === "DELIVERY_COMPANY" && (
            <MultiChip label="Gouvernorats couverts" options={TUNISIAN_GOVERNORATES}
              selected={form.governorates} onChange={v => setForm(f => ({ ...f, governorates: v }))} />
          )}
          {user.role === "PRINTER" && (
            <MultiChip label="Catégories impression" options={PRINT_CATS}
              selected={form.printCategories} onChange={v => setForm(f => ({ ...f, printCategories: v }))} />
          )}
          {user.role === "MARKETING" && (
            <MultiChip label="Services marketing" options={MARKETING_CATS}
              selected={form.marketingCategories} onChange={v => setForm(f => ({ ...f, marketingCategories: v }))} />
          )}
          {(user.role === "BARISTA_ACADEMY" || user.role === "BARISTA_MARKETPLACE") && (
            <MultiChip label="Spécialités" options={BARISTA_SPECIALTIES}
              selected={form.categories} onChange={v => setForm(f => ({ ...f, categories: v }))} />
          )}

          {/* Save button */}
          <Button onClick={handleSave} disabled={isPending} className="w-full gap-2" data-testid="button-save-user-detail">
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? "Enregistrement…" : "Enregistrer les modifications"}
          </Button>

          {/* Status actions */}
          {canApprove && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Actions administrateur</p>
              <div className="flex flex-wrap gap-2">
                {userStatus !== "approved" && (
                  <Button size="sm" variant="outline" disabled={isPending}
                    className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50 gap-1"
                    onClick={() => statusMutation.mutate({ status: "approved" })}
                    data-testid="button-modal-approve">
                    <CheckCircle className="w-3 h-3" /> Approuver
                  </Button>
                )}
                {userStatus !== "pending" && (
                  <Button size="sm" variant="outline" disabled={isPending}
                    className="h-7 text-xs gap-1"
                    onClick={() => statusMutation.mutate({ status: "pending" })}
                    data-testid="button-modal-hold">
                    <Clock className="w-3 h-3" /> Mettre en attente
                  </Button>
                )}
                {userStatus !== "rejected" && (
                  <Button size="sm" variant="outline" disabled={isPending}
                    className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1"
                    onClick={() => statusMutation.mutate({ status: "rejected" })}
                    data-testid="button-modal-reject">
                    <XCircle className="w-3 h-3" /> Rejeter
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Delete zone */}
          <div className="border-t pt-3">
            {!confirmDelete ? (
              <Button size="sm" variant="outline" disabled={isPending}
                className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1"
                onClick={() => setConfirmDelete(true)}
                data-testid="button-modal-delete">
                <Trash2 className="w-3 h-3" /> Supprimer l'utilisateur
              </Button>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Confirmer la suppression définitive ?</p>
                <p className="text-xs text-muted-foreground">Cette action est irréversible.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">Annuler</Button>
                  <Button size="sm" variant="destructive" disabled={isPending}
                    onClick={() => deleteMutation.mutate()}
                    className="flex-1"
                    data-testid="button-modal-confirm-delete">
                    Supprimer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add User Modal ─────────────────────────────────────────────────────────────

function AddUserModal({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("CAFE_OWNER");
  const [form, setForm] = useState({
    email: "", phone: "", password: "",
    firstName: "", lastName: "",
    cafeName: "", companyName: "", contactName: "",
    governorates: [] as string[],
    printCategories: [] as string[],
    marketingCategories: [] as string[],
    categories: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setRole("CAFE_OWNER");
    setForm({ email: "", phone: "", password: "", firstName: "", lastName: "", cafeName: "", companyName: "", contactName: "", governorates: [], printCategories: [], marketingCategories: [], categories: [] });
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email.trim() || !form.email.includes("@")) e.email = "Email valide requis";
    if (form.phone.length < 8) e.phone = "Numéro invalide (min. 8 chiffres)";
    if (form.password.length < 6) e.password = "Min. 6 caractères";
    switch (role) {
      case "CAFE_OWNER":
        if (form.cafeName.trim().length < 2) e.cafeName = "Nom du café requis";
        if (form.firstName.trim().length < 2) e.firstName = "Prénom requis";
        break;
      case "DELIVERY_COMPANY":
        if (form.firstName.trim().length < 2) e.firstName = "Prénom requis";
        if (form.lastName.trim().length < 2) e.lastName = "Nom requis";
        if (form.governorates.length === 0) e.governorates = "Sélectionnez au moins un gouvernorat";
        break;
      default:
        if (form.companyName.trim().length < 2) e.companyName = "Nom d'entreprise requis";
        if (form.contactName.trim().length < 2) e.contactName = "Nom du contact requis";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildName = () => {
    switch (role) {
      case "CAFE_OWNER": return `${form.firstName} — ${form.cafeName}`;
      case "DELIVERY_COMPANY": return `${form.firstName} ${form.lastName}`;
      default: return form.companyName;
    }
  };

  const sf = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    if (!validate()) return;
    const payload: any = {
      role, name: buildName(),
      email: form.email, phone: form.phone, password: form.password,
    };
    if (role === "DELIVERY_COMPANY") payload.governorates = form.governorates;
    if (role === "PRINTER") payload.printCategories = form.printCategories;
    if (role === "MARKETING") payload.marketingCategories = form.marketingCategories;
    if (role === "BARISTA_ACADEMY" || role === "BARISTA_MARKETPLACE") payload.categories = form.categories;

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Erreur", description: err.message, variant: "destructive" });
        return;
      }
      toast({ title: "Utilisateur créé", description: `${buildName()} a été ajouté.` });
      reset(); setOpen(false); onRefresh();
    } catch {
      toast({ title: "Erreur", description: "Impossible de créer l'utilisateur.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-user" className="gap-2">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Ajouter un utilisateur</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">

          {/* Role */}
          <div className="space-y-1.5">
            <Label>Type de compte</Label>
            <Select value={role} onValueChange={v => { setRole(v); setErrors({}); }}>
              <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGISTERABLE_ROLES.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Role-specific name fields */}
          {role === "CAFE_OWNER" && (
            <>
              <div className="space-y-1.5">
                <Label>Nom du café *</Label>
                <Input data-testid="input-cafe-name" value={form.cafeName} onChange={sf("cafeName")} placeholder="ex: Ariana Lounge" />
                {errors.cafeName && <p className="text-xs text-destructive">{errors.cafeName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Prénom du gérant *</Label>
                <Input data-testid="input-first-name" value={form.firstName} onChange={sf("firstName")} placeholder="ex: Ahmed" />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
              </div>
            </>
          )}
          {role === "DELIVERY_COMPANY" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prénom *</Label>
                <Input data-testid="input-first-name" value={form.firstName} onChange={sf("firstName")} placeholder="Prénom" />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input data-testid="input-last-name" value={form.lastName} onChange={sf("lastName")} placeholder="Nom" />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
              </div>
            </div>
          )}
          {!["CAFE_OWNER", "DELIVERY_COMPANY"].includes(role) && (
            <>
              <div className="space-y-1.5">
                <Label>Nom de l'entreprise *</Label>
                <Input data-testid="input-company-name" value={form.companyName} onChange={sf("companyName")} placeholder="ex: PrintExpress" />
                {errors.companyName && <p className="text-xs text-destructive">{errors.companyName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nom du contact *</Label>
                <Input data-testid="input-contact-name" value={form.contactName} onChange={sf("contactName")} placeholder="ex: Sami Ben Ali" />
                {errors.contactName && <p className="text-xs text-destructive">{errors.contactName}</p>}
              </div>
            </>
          )}

          {/* Base fields */}
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input data-testid="input-user-email" type="email" value={form.email} onChange={sf("email")} placeholder="contact@exemple.com" />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Téléphone *</Label>
            <Input data-testid="input-user-phone" value={form.phone} onChange={sf("phone")} placeholder="+216 xx xxx xxx" />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Mot de passe *</Label>
            <Input data-testid="input-user-password" type="password" value={form.password} onChange={sf("password")} placeholder="Min. 6 caractères" />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          {/* Role-specific multi-selects */}
          {role === "DELIVERY_COMPANY" && (
            <div className="space-y-1">
              <MultiChip label="Gouvernorats couverts *" options={TUNISIAN_GOVERNORATES}
                selected={form.governorates} onChange={v => setForm(f => ({ ...f, governorates: v }))} />
              {errors.governorates && <p className="text-xs text-destructive">{errors.governorates}</p>}
            </div>
          )}
          {role === "PRINTER" && (
            <MultiChip label="Catégories impression" options={PRINT_CATS}
              selected={form.printCategories} onChange={v => setForm(f => ({ ...f, printCategories: v }))} />
          )}
          {role === "MARKETING" && (
            <MultiChip label="Services marketing" options={MARKETING_CATS}
              selected={form.marketingCategories} onChange={v => setForm(f => ({ ...f, marketingCategories: v }))} />
          )}
          {(role === "BARISTA_ACADEMY" || role === "BARISTA_MARKETPLACE") && (
            <MultiChip label="Spécialités" options={BARISTA_SPECIALTIES}
              selected={form.categories} onChange={v => setForm(f => ({ ...f, categories: v }))} />
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => { setOpen(false); reset(); }}>Annuler</Button>
            <Button className="flex-1" onClick={submit} data-testid="button-submit-user">Créer l'utilisateur</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/admin/users/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_, { status }) => {
      invalidateUsers();
      toast({ title: status === "approved" ? "Compte approuvé" : status === "rejected" ? "Compte rejeté" : "Statut mis à jour" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de mettre à jour.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      invalidateUsers();
      toast({ title: "Utilisateur supprimé" });
      setDeletingUser(null);
    },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const filtered = users.filter(u => {
    const matchStatus = statusFilter === "all" || (u as any).status === statusFilter;
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchStatus && matchRole;
  });

  const pendingCount = users.filter(u => (u as any).status === "pending").length;
  const totalNonAdmin = users.filter(u => !["ADMIN", "SUPER_ADMIN"].includes(u.role)).length;
  const adminCount = users.filter(u => ["ADMIN", "SUPER_ADMIN"].includes(u.role)).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Utilisateurs</h1>
          <p className="text-muted-foreground text-sm mt-1">Gérez les utilisateurs et approuvez les comptes en attente.</p>
        </div>
        <AddUserModal onRefresh={invalidateUsers} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Users className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Total utilisateurs</p><p className="text-2xl font-bold">{users.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><UserCheck className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Membres actifs</p><p className="text-2xl font-bold">{totalNonAdmin}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-yellow-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-yellow-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">En attente</p><p className="text-2xl font-bold text-yellow-600">{pendingCount}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-purple-500/10 rounded-xl p-3"><ShieldCheck className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Admins</p><p className="text-2xl font-bold">{adminCount}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* User Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold">Tous les utilisateurs</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Tous statuts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvé</SelectItem>
                  <SelectItem value="rejected">Rejeté</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Inscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => {
                  const userStatus = (u as any).status ?? "approved";
                  const sc = statusConfig[userStatus] ?? statusConfig.approved;
                  const Icon = sc.icon;
                  const canApprove = APPROVABLE_ROLES.includes(u.role);

                  return (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <button
                          className="font-medium hover:text-primary transition-colors text-left"
                          onClick={() => setSelectedUserId(u.id)}
                          data-testid={`button-user-detail-${u.id}`}
                        >
                          {u.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={roleColors[u.role] || ""}>
                          {u.role.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${sc.className} border text-xs gap-1`}>
                          <Icon className="w-3 h-3" />{sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canApprove && (
                            <>
                              {userStatus !== "approved" && (
                                <Button size="sm" variant="outline"
                                  className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50 hover:border-green-400 gap-1"
                                  onClick={() => statusMutation.mutate({ id: u.id, status: "approved" })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`button-approve-${u.id}`}>
                                  <CheckCircle className="w-3 h-3" /> Approuver
                                </Button>
                              )}
                              {userStatus !== "rejected" && (
                                <Button size="sm" variant="outline"
                                  className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 gap-1"
                                  onClick={() => statusMutation.mutate({ id: u.id, status: "rejected" })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`button-reject-${u.id}`}>
                                  <XCircle className="w-3 h-3" /> Rejeter
                                </Button>
                              )}
                              {userStatus !== "pending" && (
                                <Button size="sm" variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => statusMutation.mutate({ id: u.id, status: "pending" })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`button-pending-${u.id}`}>
                                  <Clock className="w-3 h-3" /> En attente
                                </Button>
                              )}
                            </>
                          )}
                          <Button size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:bg-red-50 hover:text-destructive"
                            onClick={() => setDeletingUser(u)}
                            data-testid={`button-delete-${u.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Aucun utilisateur ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User Detail Modal — live-synced via selectedUserId → users query */}
      <UserDetailDialog
        user={selectedUser}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />

      {/* Delete confirmation dialog */}
      {deletingUser && (
        <Dialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Supprimer "{deletingUser.name}" ?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Cette action est irréversible. L'utilisateur et toutes ses données seront définitivement supprimés.
            </p>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="outline" onClick={() => setDeletingUser(null)}>Annuler</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingUser.id)}
                data-testid="button-confirm-delete-user">
                Supprimer définitivement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
