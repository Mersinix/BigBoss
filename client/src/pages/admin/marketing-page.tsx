import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useFormatCurrency } from "@/hooks/use-currency";
import {
  Megaphone, Users, Briefcase, Clock, CheckCircle, XCircle, Star, Plus, Pencil,
  Trash2, Snowflake, Search, MapPin, Phone, Image, DollarSign, Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { MarketingDetailModal } from "@/components/marketing/marketing-detail-modal";
import { MarketingServiceDetailModal } from "@/components/marketing/marketing-service-detail-modal";

// Mirrors admin/maintenance-page.tsx's architecture exactly: one aggregate
// overview endpoint (/api/admin/marketing), client-side tabs/filters over it,
// no pagination — same reference pattern used by Admin Print/Barista/Academy.

type TaxonomyItem = { id: number; name: string; icon?: string | null; isActive: boolean; isFrozen: boolean };
type Overview = {
  stats: {
    totalAccounts: number; activeAccounts: number; visibleAccounts: number;
    totalProjects: number; pendingProjects: number; activeProjects: number;
    completedProjects: number; cancelledProjects: number; reviewCount: number;
    averageRating: number; totalRevenueCents: number;
  };
  categories: { category: string; count: number }[];
  taxonomy: TaxonomyItem[];
  accounts: any[];
  projects: any[];
  reviews: any[];
};

function Stars({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-0.5 text-amber-500">
    <Star className="h-3.5 w-3.5 fill-current" /> {value ? (value / 10).toFixed(1) : "—"}
  </span>;
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return <div className="flex gap-2"><Icon className="h-4 w-4 text-fuchsia-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">{label}</p><p>{value || "—"}</p></div></div>;
}

function TaxonomyList({ items, onRefresh }: { items: TaxonomyItem[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [draftIcon, setDraftIcon] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [iconEditing, setIconEditing] = useState<number | null>(null);
  const [iconEditValue, setIconEditValue] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/marketing/categories", { name: draft.trim(), icon: draftIcon.trim() || null }),
    onSuccess: () => { setDraft(""); setDraftIcon(""); onRefresh(); toast({ title: "Ajouté" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/marketing/categories/${id}`, data),
    onSuccess: () => { setEditing(null); setIconEditing(null); onRefresh(); },
    onError: () => toast({ title: "Mise à jour impossible", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/marketing/categories/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "Suppression impossible", variant: "destructive" }),
  });
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-base">Catégories de services</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex gap-2">
        <Input value={draftIcon} onChange={(e) => setDraftIcon(e.target.value)} placeholder="📢" className="w-14 text-center text-lg shrink-0" data-testid="input-marketing-category-draft-icon" />
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ajouter une catégorie" onKeyDown={(e) => e.key === "Enter" && draft.trim() && create.mutate()} />
        <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
        {iconEditing === item.id ? (
          <Input autoFocus value={iconEditValue} onChange={(e) => setIconEditValue(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter") update.mutate({ id: item.id, data: { icon: iconEditValue.trim() || null } });
            if (e.key === "Escape") setIconEditing(null);
          }} onBlur={() => update.mutate({ id: item.id, data: { icon: iconEditValue.trim() || null } })} className="w-12 text-center text-lg shrink-0 p-1" />
        ) : (
          <button
            type="button"
            title="Modifier l'icône"
            className="w-8 h-8 shrink-0 flex items-center justify-center text-lg rounded-md hover:bg-muted"
            onClick={() => { setIconEditing(item.id); setIconEditValue(item.icon ?? ""); }}
            data-testid={`button-edit-marketing-category-icon-${item.id}`}
          >
            {item.icon || <Megaphone className="h-4 w-4 text-muted-foreground" />}
          </button>
        )}
        {editing === item.id ? <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Enter" && editValue.trim()) update.mutate({ id: item.id, data: { name: editValue.trim() } });
          if (e.key === "Escape") setEditing(null);
        }} /> : <span className="flex-1 text-sm font-medium">{item.name}</span>}
        {item.isFrozen && <Badge variant="outline" className="text-xs text-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}
        {!item.isActive && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
        {editing === item.id ? <Button size="sm" onClick={() => editValue.trim() && update.mutate({ id: item.id, data: { name: editValue.trim() } })}>OK</Button> : <Button variant="ghost" size="icon" onClick={() => { setEditing(item.id); setEditValue(item.name); }}><Pencil className="h-3.5 w-3.5" /></Button>}
        <Button variant="ghost" size="icon" title={item.isFrozen ? "Dégeler" : "Geler"} onClick={() => update.mutate({ id: item.id, data: { isFrozen: !item.isFrozen } })}><Snowflake className={`h-3.5 w-3.5 ${item.isFrozen ? "text-blue-600" : ""}`} /></Button>
        <Button variant="ghost" size="icon" title={item.isActive ? "Désactiver" : "Activer"} onClick={() => update.mutate({ id: item.id, data: { isActive: !item.isActive } })}><CheckCircle className={`h-3.5 w-3.5 ${item.isActive ? "text-green-600" : "text-muted-foreground"}`} /></Button>
        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>)}
    </CardContent>
  </Card>;
}

function AccountDetail({ account, onClose, onRefresh }: { account: any | null; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);

  const startEdit = () => {
    setForm({
      name: account.name, phone: account.phone ?? "", profileType: account.profileType,
      startingPriceInCents: String((account.startingPriceInCents ?? 0) / 100), description: account.description ?? "",
    });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/marketing/accounts/${account.userId}`, {
      name: form.name, phone: form.phone, profileType: form.profileType, description: form.description,
      startingPriceInCents: Math.round(parseFloat(form.startingPriceInCents || "0") * 100),
    }),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Compte mis à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/marketing/accounts/${account.userId}/freeze`, { isFrozen }),
    onSuccess: () => { onRefresh(); toast({ title: account.isFrozen ? "Compte dégelé" : "Compte gelé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/users/${account.userId}`),
    onSuccess: () => { onRefresh(); onClose(); toast({ title: "Compte supprimé" }); },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e.message, variant: "destructive" }),
  });

  if (!account) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-3">
        <Avatar><AvatarImage src={getAvatarUrl(account)} alt={account.name} /><AvatarFallback className="bg-fuchsia-100 text-fuchsia-700 font-bold">{account.initials}</AvatarFallback></Avatar>
        <span className="flex-1">{account.name}</span>
        {/* Same synchronized Marketing Profile Details modal reused by the provider's own
            Eye preview and Coffee Owner /marketing (Part 41-42) — read-only here, Admin's
            approval/freeze/delete controls stay on this dialog's own actions below. */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setProfileOpen(true)} data-testid="button-preview-marketing-marketplace">
          <Eye className="w-3.5 h-3.5" /> Aperçu marketplace
        </Button>
      </DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Badge variant="outline">{account.status}</Badge><Badge variant="secondary">{account.profileType}</Badge>
          <Badge className={account.marketplaceVisible ? "bg-green-600" : ""}>{account.marketplaceVisible ? "Visible marketplace" : "Masqué"}</Badge>
          {account.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé par l'Admin</Badge>}
        </div>

        {editing ? (
          <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Nom</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={form.profileType} onValueChange={(v) => setForm({ ...form, profileType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Agency">Agency</SelectItem><SelectItem value="Freelancer">Freelancer</SelectItem><SelectItem value="Studio">Studio</SelectItem></SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">Prix de départ (DT)</label><Input type="number" min={0} value={form.startingPriceInCents} onChange={(e) => setForm({ ...form, startingPriceInCents: e.target.value })} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Description</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              <Button size="sm" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </div>
        ) : <>
          <Info icon={MapPin} label="Localisation" value={account.location} />
          <Info icon={Phone} label="Téléphone" value={account.phone} />
          <Info icon={Star} label="Évaluation" value={<><Stars value={account.rating} /> ({account.reviewCount} avis)</>} />
          {/* Agency → Multiple Services: price/response-time now live per-service below,
              not as one flat agency-level figure. */}
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1.5">Services ({(account.services ?? []).length})</p>
            {(account.services ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun service créé.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {account.services.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedServiceId(s.id)}
                    className="text-left rounded-lg border p-2.5 text-sm hover:border-fuchsia-400 transition-colors"
                    data-testid={`button-admin-service-${s.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{s.category}</span>
                      <Badge variant={s.isPublished ? "default" : "secondary"} className={`text-[10px] shrink-0 ${s.isPublished ? "bg-green-600" : ""}`}>{s.isPublished ? "Publié" : "Brouillon"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmt(s.startingPriceInCents)} · {s.responseTime}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground mb-1">Description</p><p className="whitespace-pre-wrap">{account.description || "—"}</p></div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Image className="h-3.5 w-3.5" />Portfolio</p>
            {(account.portfolioImages ?? []).length > 0
              ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{account.portfolioImages.map((src: string, index: number) => <img key={`${src}-${index}`} src={src} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />)}</div>
              : <p>—</p>}
          </div>
        </>}

        <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {!editing && <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-marketing-account"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
          <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!account.isFrozen)} data-testid="button-freeze-marketing-account">
            <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${account.isFrozen ? "text-blue-600" : ""}`} />{account.isFrozen ? "Dégeler" : "Freeze"}
          </Button>
          {!confirmDelete ? (
            <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-marketing-account">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
              <span className="text-xs text-destructive">Confirmer la suppression définitive ?</span>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-marketing-account">
                {deleteMutation.isPending ? "Suppression…" : "Confirmer"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
    <MarketingDetailModal marketingUserId={account.userId} open={profileOpen} onClose={() => setProfileOpen(false)} onRequestQuote={() => {}} readOnly />
    <MarketingServiceDetailModal serviceId={selectedServiceId} open={selectedServiceId != null} onClose={() => setSelectedServiceId(null)} readOnly />
  </Dialog>;
}

// Reuses the existing generic Admin account-creation endpoint (POST
// /api/admin/users, already handles role="MARKETING" by also creating the
// marketingProfiles row — see storage.createUser) rather than a second
// Marketing-specific creation path.
function AddMarketingAccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", profileType: "Agency" });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", { ...form, role: "MARKETING" }),
    onSuccess: async (res) => {
      const created = await res.json();
      if (form.profileType) {
        await apiRequest("PATCH", `/api/admin/marketing/accounts/${created.id}`, { profileType: form.profileType }).catch(() => {});
      }
      onCreated();
      onClose();
      setForm({ name: "", email: "", password: "", phone: "", profileType: "Agency" });
      toast({ title: "Compte Marketing créé" });
    },
    onError: (e: any) => toast({ title: "Création impossible", description: e.message, variant: "destructive" }),
  });
  const valid = form.name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 6;
  return <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Ajouter un compte Marketing</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">Nom / Agence</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-add-marketing-name" /></div>
        <div><label className="text-xs text-muted-foreground">Email</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-add-marketing-email" /></div>
        <div><label className="text-xs text-muted-foreground">Mot de passe</label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-add-marketing-password" /></div>
        <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-add-marketing-phone" /></div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={form.profileType} onValueChange={(v) => setForm({ ...form, profileType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Agency">Agency</SelectItem><SelectItem value="Freelancer">Freelancer</SelectItem><SelectItem value="Studio">Studio</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()} data-testid="button-submit-add-marketing">{create.isPending ? "Création…" : "Créer le compte"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function ProjectCard({ row, onClick }: { row: any; onClick: () => void }) {
  const fmt = useFormatCurrency();
  return <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick} data-testid={`card-marketing-project-${row.id}`}>
    <CardContent className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-semibold text-sm truncate">{row.service}</p><p className="text-xs text-muted-foreground truncate">{row.title || "—"}</p></div>
        <div className="flex items-center gap-1.5 shrink-0">{row.isFrozen && <Snowflake className="h-3.5 w-3.5 text-blue-600" />}<Badge variant="outline">{row.status}</Badge></div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="truncate">Marketing : <span className="font-medium text-foreground">{row.marketingName}</span></span>
        {(row.finalAmountInCents != null || row.quoteAmountInCents != null) && <span className="font-medium shrink-0">{fmt(row.finalAmountInCents ?? row.quoteAmountInCents ?? 0)}</span>}
      </div>
      <div className="text-xs truncate">Coffee Owner : <span className="font-medium">{row.cafeOwner}</span></div>
      {row.description && <p className="text-xs text-muted-foreground truncate">{row.description}</p>}
    </CardContent>
  </Card>;
}

const PROJECT_STATUSES = ["PENDING", "QUOTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"];

function ProjectDetail({ project, onClose, onRefresh }: { project: any | null; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setForm({
      service: project.service, title: project.title ?? "", description: project.description ?? "", status: project.status,
      quoteAmountInCents: String((project.quoteAmountInCents ?? 0) / 100), finalAmountInCents: String((project.finalAmountInCents ?? 0) / 100),
      progress: String(project.progress ?? 0),
    });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/marketing/projects/${project.id}`, {
      service: form.service, title: form.title, description: form.description, status: form.status,
      quoteAmountInCents: Math.round(parseFloat(form.quoteAmountInCents || "0") * 100),
      finalAmountInCents: Math.round(parseFloat(form.finalAmountInCents || "0") * 100),
      progress: Math.min(100, Math.max(0, parseInt(form.progress || "0", 10))),
    }),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Projet mis à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/marketing/projects/${project.id}/freeze`, { isFrozen }),
    onSuccess: () => { onRefresh(); toast({ title: project.isFrozen ? "Projet dégelé" : "Projet gelé" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/marketing/projects/${project.id}`),
    onSuccess: () => { onRefresh(); onClose(); toast({ title: "Projet supprimé" }); },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e.message, variant: "destructive" }),
  });

  if (!project) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Projet #{project.id}</DialogTitle></DialogHeader>
      {editing ? (
        <div className="space-y-2">
          <div><label className="text-xs text-muted-foreground">Service</label><Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Titre</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Description</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Devis (DT)</label><Input type="number" min={0} value={form.quoteAmountInCents} onChange={(e) => setForm({ ...form, quoteAmountInCents: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Facture (DT)</label><Input type="number" min={0} value={form.finalAmountInCents} onChange={(e) => setForm({ ...form, finalAmountInCents: e.target.value })} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Progression (%)</label><Input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} /></div>
          <div>
            <label className="text-xs text-muted-foreground">Statut</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
            <Button disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2"><Badge variant="outline">{project.status}</Badge>{project.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}</div>
          <Info icon={Megaphone} label="Service" value={project.service} />
          <Info icon={DollarSign} label="Montant" value={fmt(project.finalAmountInCents ?? project.quoteAmountInCents ?? 0)} />
          <Info icon={Briefcase} label="Marketing" value={project.marketingName} />
          <Info icon={Users} label="Coffee Owner" value={project.cafeOwner} />
          <Info icon={Phone} label="Contact" value={project.ownerPhone} />
          <Info icon={Clock} label="Progression" value={`${project.progress ?? 0}%`} />
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground mb-1">Description</p><p className="whitespace-pre-wrap">{project.description || "—"}</p></div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-marketing-project"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
            <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!project.isFrozen)} data-testid="button-freeze-marketing-project">
              <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${project.isFrozen ? "text-blue-600" : ""}`} />{project.isFrozen ? "Dégeler" : "Freeze"}
            </Button>
            {!confirmDelete ? (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-marketing-project"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
                <span className="text-xs text-destructive">Confirmer ?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-marketing-project">{deleteMutation.isPending ? "…" : "Confirmer"}</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>;
}

export default function MarketingAdminPage() {
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  useRealtime();
  const [section, setSection] = useState("taxonomy");
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [profileType, setProfileType] = useState("all");
  const [category, setCategory] = useState("all");
  const [rating, setRating] = useState("all");
  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/marketing"] });

  useEffect(() => {
    if (!selectedAccount) return;
    const fresh = data?.accounts?.find((a) => a.userId === selectedAccount.userId);
    if (fresh && fresh !== selectedAccount) setSelectedAccount(fresh);
  }, [data?.accounts, selectedAccount?.userId]);
  useEffect(() => {
    if (!selectedProject) return;
    const fresh = data?.projects?.find((row: any) => row.id === selectedProject.id);
    if (fresh && fresh !== selectedProject) setSelectedProject(fresh);
  }, [data?.projects, selectedProject?.id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/marketing"] });
    qc.invalidateQueries({ queryKey: ["/api/marketing/categories"] });
    qc.invalidateQueries({ queryKey: ["/api/marketing/taxonomy"] });
  };
  const stats = data?.stats;
  // Agency → Multiple Services: categories now live on each agency's real services
  // (account.services), not the legacy profile.categories field (kept but no longer
  // maintained — see storage.migrateMarketingServicesIfNeeded).
  const filterOptions = useMemo(() => {
    const accounts = data?.accounts ?? [];
    return {
      types: Array.from(new Set(accounts.map((a) => a.profileType).filter(Boolean))).sort(),
      categories: Array.from(new Set(accounts.flatMap((a) => (a.services ?? []).map((s: any) => s.category)))).sort(),
    };
  }, [data?.accounts]);
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => {
    const serviceCategories = (a.services ?? []).map((s: any) => s.category);
    const haystack = [a.name, a.location, ...serviceCategories].join(" ").toLowerCase();
    const accountRating = (a.rating ?? 0) / 10;
    return (!search || haystack.includes(search.toLowerCase()))
      && (status === "all" || a.status === status)
      && (visibility === "all" || (visibility === "visible" ? a.marketplaceVisible : !a.marketplaceVisible))
      && (profileType === "all" || a.profileType === profileType)
      && (category === "all" || serviceCategories.includes(category))
      && (rating === "all" || (rating === "rated" ? accountRating > 0 : accountRating >= Number(rating)));
  }), [data?.accounts, search, status, visibility, profileType, category, rating]);
  const kpis = [
    ["Comptes Marketing", stats?.totalAccounts ?? 0, Users], ["Actifs / approuvés", stats?.activeAccounts ?? 0, CheckCircle],
    ["Visibles marketplace", stats?.visibleAccounts ?? 0, Megaphone], ["Projets", stats?.totalProjects ?? 0, Briefcase],
    ["En attente", stats?.pendingProjects ?? 0, Clock], ["Terminés", stats?.completedProjects ?? 0, CheckCircle],
    ["Annulés / refusés", stats?.cancelledProjects ?? 0, XCircle], ["Note moyenne", stats ? stats.averageRating.toFixed(1) : "0.0", Star],
  ] as const;

  return <div className="flex flex-col gap-6 p-6">
    <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Megaphone className="w-6 h-6 text-fuchsia-600" />Marketing</h1><p className="text-muted-foreground text-sm mt-1">Suivi du marketplace Marketing, des comptes, projets et avis.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{kpis.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4 flex items-center gap-3"><div className="rounded-xl bg-fuchsia-500/10 p-2.5"><Icon className="w-4 h-4 text-fuchsia-600" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div></CardContent></Card>)}</div>
    {!isLoading && stats && stats.totalRevenueCents > 0 && (
      <p className="text-sm text-muted-foreground -mt-2">Chiffre d'affaires plateforme (projets terminés) : <span className="font-semibold text-foreground">{fmt(stats.totalRevenueCents)}</span></p>
    )}
    <Tabs value={section} onValueChange={setSection}>
      <TabsList className="flex-nowrap h-auto w-full justify-start overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        <TabsTrigger value="taxonomy" className="shrink-0">Catégories de services</TabsTrigger>
        <TabsTrigger value="accounts" className="shrink-0">Comptes Marketing</TabsTrigger>
        <TabsTrigger value="projects" className="shrink-0">Projets récents</TabsTrigger>
      </TabsList>
      <TabsContent value="taxonomy" className="mt-4 grid lg:grid-cols-2 gap-6">
        <TaxonomyList items={data?.taxonomy ?? []} onRefresh={refresh} />
        <Card><CardHeader><CardTitle className="text-base">Demandes par catégorie</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(data?.categories ?? []).map((row) => <Badge key={row.category} variant="secondary">{row.category} · {row.count}</Badge>)}</CardContent></Card>
      </TabsContent>
      <TabsContent value="accounts" className="mt-4 space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddAccountOpen(true)} data-testid="button-add-marketing-account"><Plus className="h-4 w-4 mr-1.5" />Ajouter un compte Marketing</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un compte, un service…" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent></Select>
          <Select value={visibility} onValueChange={setVisibility}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Visibilité" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes visibilités</SelectItem><SelectItem value="visible">Visible</SelectItem><SelectItem value="hidden">Masqué</SelectItem></SelectContent></Select>
          <Select value={profileType} onValueChange={setProfileType}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les types</SelectItem>{filterOptions.types.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Service" /></SelectTrigger><SelectContent><SelectItem value="all">Tous services</SelectItem>{filterOptions.categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={rating} onValueChange={setRating}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Note" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les notes</SelectItem><SelectItem value="rated">Avec avis</SelectItem><SelectItem value="4">4+ étoiles</SelectItem><SelectItem value="3">3+ étoiles</SelectItem></SelectContent></Select>
        </div>
        {accounts.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun compte correspondant.</CardContent></Card> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{accounts.map((account) => <Card key={account.userId} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAccount(account)}><CardContent className="p-4 space-y-3"><div className="flex items-start gap-3"><Avatar><AvatarImage src={getAvatarUrl(account)} alt={account.name} /><AvatarFallback className="bg-fuchsia-100 text-fuchsia-700 font-bold">{account.initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{account.name}</h3><p className="text-xs text-muted-foreground truncate">{account.location || "—"}</p></div><span className={`h-2.5 w-2.5 rounded-full mt-1 ${account.marketplaceVisible ? "bg-green-500" : "bg-gray-300"}`} /></div><div className="flex flex-wrap gap-1"><Badge variant="secondary" className="text-xs">{account.profileType}</Badge><Badge variant="outline" className="text-xs">{account.status}</Badge></div><div className="flex items-center justify-between text-xs"><Stars value={account.rating} /><span className="text-muted-foreground">{account.reviewCount} avis</span></div>{/* Real services (Part 10), not the legacy profile.categories field */}<div className="flex flex-wrap gap-1">{(account.services ?? []).slice(0, 4).map((s: any) => <span key={s.id} className={`rounded-full px-2 py-0.5 text-[10px] ${s.isPublished ? "bg-muted" : "bg-muted/50 text-muted-foreground/70 italic"}`}>{s.category}</span>)}{(account.services ?? []).length === 0 && <span className="text-[10px] text-muted-foreground italic">Aucun service</span>}</div></CardContent></Card>)}</div>}
      </TabsContent>
      <TabsContent value="projects" className="mt-4">
        {!data?.projects?.length ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun projet.</CardContent></Card> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(data?.projects ?? []).slice(0, 50).map((row: any) => <ProjectCard key={row.id} row={row} onClick={() => setSelectedProject(row)} />)}
          </div>
        )}
      </TabsContent>
    </Tabs>
    <AccountDetail account={selectedAccount} onClose={() => setSelectedAccount(null)} onRefresh={refresh} />
    <AddMarketingAccountModal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} onCreated={refresh} />
    <ProjectDetail project={selectedProject} onClose={() => setSelectedProject(null)} onRefresh={refresh} />
  </div>;
}
