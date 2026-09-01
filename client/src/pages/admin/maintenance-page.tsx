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
import {
  Wrench, Users, Calendar, Clock, CheckCircle, XCircle, Star, Plus, Pencil,
  Trash2, Snowflake, Search, MapPin, Phone, Award, Briefcase, Timer, Image, Zap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";

type TaxonomyItem = { id: number; name: string; icon?: string | null; isActive: boolean; isFrozen: boolean };
type Overview = {
  stats: {
    totalAccounts: number; activeAccounts: number; availableAccounts: number;
    totalReservations: number; pendingReservations: number; completedReservations: number;
    cancelledReservations: number; reviewCount: number; averageRating: number;
  };
  categories: { category: string; count: number }[];
  taxonomy: { competencies: TaxonomyItem[]; zones: TaxonomyItem[] };
  accounts: any[];
  reservations: any[];
  reviews: any[];
};

function Stars({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-0.5 text-amber-500">
    <Star className="h-3.5 w-3.5 fill-current" /> {value ? (value / 10).toFixed(1) : "—"}
  </span>;
}

function TaxonomyList({ title, items, kind, onRefresh }: {
  title: string; items: TaxonomyItem[]; kind: "competencies" | "zones"; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [draftIcon, setDraftIcon] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [iconEditing, setIconEditing] = useState<number | null>(null);
  const [iconEditValue, setIconEditValue] = useState("");
  const path = kind === "competencies" ? "competencies" : "zones";
  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/maintenance/${path}`, { name: draft.trim(), ...(kind === "competencies" ? { icon: draftIcon.trim() || null } : {}) }),
    onSuccess: () => { setDraft(""); setDraftIcon(""); onRefresh(); toast({ title: "Ajouté" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/maintenance/${path}/${id}`, data),
    onSuccess: () => { setEditing(null); setIconEditing(null); onRefresh(); },
    onError: () => toast({ title: "Mise à jour impossible", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/maintenance/${path}/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "Suppression impossible", variant: "destructive" }),
  });
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex gap-2">
        {kind === "competencies" && (
          <Input value={draftIcon} onChange={(e) => setDraftIcon(e.target.value)} placeholder="☕" className="w-14 text-center text-lg shrink-0" data-testid="input-competency-draft-icon" />
        )}
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ajouter ${kind === "zones" ? "une zone" : "une compétence"}`} onKeyDown={(e) => e.key === "Enter" && draft.trim() && create.mutate()} />
        <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
        {kind === "competencies" && (
          iconEditing === item.id ? (
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
              data-testid={`button-edit-competency-icon-${item.id}`}
            >
              {item.icon || <Wrench className="h-4 w-4 text-muted-foreground" />}
            </button>
          )
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
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setForm({
      name: account.name, phone: account.phone ?? "", jobTitle: account.jobTitle,
      dailyRateInCents: String((account.dailyRateInCents ?? 0) / 100), coverageArea: account.coverageArea ?? "",
      description: account.description ?? "", yearsExperience: String(account.yearsExperience ?? 0),
    });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/maintenance/accounts/${account.userId}`, {
      name: form.name, phone: form.phone, jobTitle: form.jobTitle, coverageArea: form.coverageArea,
      description: form.description, yearsExperience: Number(form.yearsExperience) || 0,
      dailyRateInCents: Math.round(parseFloat(form.dailyRateInCents || "0") * 100),
    }),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Compte mis à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/maintenance/accounts/${account.userId}/freeze`, { isFrozen }),
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
        <Avatar><AvatarImage src={getAvatarUrl(account)} alt={account.name} /><AvatarFallback className="bg-orange-100 text-orange-700 font-bold">{account.initials}</AvatarFallback></Avatar>
        <span>{account.name}</span>
      </DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Badge variant="outline">{account.status}</Badge><Badge variant="secondary">{account.profileType}</Badge>
          <Badge className={account.marketplaceVisible ? "bg-green-600" : ""}>{account.marketplaceVisible ? "Visible marketplace" : "Masqué"}</Badge>
          <Badge variant="outline">{account.available ? "Disponible" : "Indisponible"}</Badge>
          {account.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé par l'Admin</Badge>}
        </div>

        {editing ? (
          <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Nom</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Poste</label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Zone de couverture</label><Input value={form.coverageArea} onChange={(e) => setForm({ ...form, coverageArea: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Expérience (ans)</label><Input type="number" min={0} value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Tarif journalier (DT)</label><Input type="number" min={0} value={form.dailyRateInCents} onChange={(e) => setForm({ ...form, dailyRateInCents: e.target.value })} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Description</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              <Button size="sm" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </div>
        ) : <>
          <Info icon={Briefcase} label="Poste" value={account.jobTitle} />
          <Info icon={MapPin} label="Zone / localisation" value={account.location || account.coverageArea} />
          <Info icon={Phone} label="Téléphone" value={account.phone} />
          <Info icon={Timer} label="Temps de réponse" value={account.responseTime} />
          <Info icon={Award} label="Expérience" value={`${account.yearsExperience} ans`} />
          <Info icon={Star} label="Évaluation" value={<><Stars value={account.rating} /> ({account.reviewCount} avis)</>} />
          <Info icon={MapPin} label="Zone de couverture" value={account.coverageArea} />
          <div><p className="text-xs text-muted-foreground mb-1">Compétences / catégories</p><div className="flex flex-wrap gap-1">{[...(account.categories ?? []), ...(account.skills ?? [])].map((x: string) => <Badge key={x} variant="secondary" className="text-xs">{x}</Badge>)}</div></div>
          <div><p className="text-xs text-muted-foreground mb-1">Certifications</p><p>{(account.certifications ?? []).join(", ") || "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground mb-1">Description</p><p className="whitespace-pre-wrap">{account.description || "—"}</p></div>
          <Info icon={Calendar} label="Jours et horaires" value={`${(account.workingDays ?? []).join(", ") || "—"} · ${account.startTime}–${account.endTime}`} />
          <Info icon={Wrench} label="Tarif journalier" value={`${((account.dailyRateInCents ?? 0) / 100).toFixed(2)} DT`} />
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Image className="h-3.5 w-3.5" />Portfolio</p>
            {(account.portfolioImages ?? []).length > 0
              ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{account.portfolioImages.map((src: string, index: number) => <img key={`${src}-${index}`} src={src} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />)}</div>
              : <p>—</p>}
          </div>
        </>}

        <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {!editing && <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-maintenance-account"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
          <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!account.isFrozen)} data-testid="button-freeze-maintenance-account">
            <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${account.isFrozen ? "text-blue-600" : ""}`} />{account.isFrozen ? "Dégeler" : "Freeze"}
          </Button>
          {!confirmDelete ? (
            <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-maintenance-account">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
              <span className="text-xs text-destructive">Confirmer la suppression définitive ?</span>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-maintenance-account">
                {deleteMutation.isPending ? "Suppression…" : "Confirmer"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return <div className="flex gap-2"><Icon className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">{label}</p><p>{value || "—"}</p></div></div>;
}

// Part 7 — reuses the existing generic Admin account-creation endpoint
// (POST /api/admin/users, already handles role="MAINTENANCE" by also creating
// the maintenanceProfiles row — see storage.createUser) rather than a second
// Maintenance-specific creation path.
function AddMaintenanceAccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", jobTitle: "Technicien de maintenance", profileType: "Freelance" });
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", { ...form, role: "MAINTENANCE" }),
    onSuccess: async (res) => {
      const created = await res.json();
      if (form.jobTitle || form.profileType) {
        await apiRequest("PATCH", `/api/admin/maintenance/accounts/${created.id}`, { jobTitle: form.jobTitle, profileType: form.profileType }).catch(() => {});
      }
      onCreated();
      onClose();
      setForm({ name: "", email: "", password: "", phone: "", jobTitle: "Technicien de maintenance", profileType: "Freelance" });
      toast({ title: "Compte Maintenance créé" });
    },
    onError: (e: any) => toast({ title: "Création impossible", description: e.message, variant: "destructive" }),
  });
  const valid = form.name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 6;
  return <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Ajouter un compte Maintenance</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">Nom / Structure</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-add-maintenance-name" /></div>
        <div><label className="text-xs text-muted-foreground">Email</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-add-maintenance-email" /></div>
        <div><label className="text-xs text-muted-foreground">Mot de passe</label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-add-maintenance-password" /></div>
        <div><label className="text-xs text-muted-foreground">Téléphone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-add-maintenance-phone" /></div>
        <div><label className="text-xs text-muted-foreground">Poste</label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={form.profileType} onValueChange={(v) => setForm({ ...form, profileType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="Freelance">Freelance</SelectItem><SelectItem value="Company">Entreprise</SelectItem><SelectItem value="Agency">Agence</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()} data-testid="button-submit-add-maintenance">{create.isPending ? "Création…" : "Créer le compte"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

// Part 8-9 — reservation cards + details modal with EDIT / FREEZE / DELETE.
function ReservationCard({ row, onClick }: { row: any; onClick: () => void }) {
  return <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick} data-testid={`card-maintenance-reservation-${row.id}`}>
    <CardContent className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-semibold text-sm truncate">{row.service}</p><p className="text-xs text-muted-foreground">{row.category || "—"} · {row.urgency}</p></div>
        <div className="flex items-center gap-1.5 shrink-0">{row.isFrozen && <Snowflake className="h-3.5 w-3.5 text-blue-600" />}<Badge variant="outline">{row.status}</Badge></div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{row.date} {row.time || ""}</div>
      <div className="flex items-center justify-between text-xs">
        <span className="truncate">Maintenance : <span className="font-medium text-foreground">{row.maintenanceName}</span></span>
      </div>
      <div className="text-xs truncate">Coffee Owner : <span className="font-medium">{row.cafeOwner}</span></div>
      {row.location && <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{row.location}</div>}
      {row.description && <p className="text-xs text-muted-foreground truncate">{row.description}</p>}
    </CardContent>
  </Card>;
}

const RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "RESCHEDULED", "RESCHEDULE_PENDING", "RESCHEDULE_REJECTED"];

function ReservationDetail({ reservation, onClose, onRefresh }: { reservation: any | null; onClose: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = () => {
    setForm({ service: reservation.service, date: reservation.date, time: reservation.time ?? "", location: reservation.location ?? "", description: reservation.description ?? "", status: reservation.status });
    setEditing(true);
  };
  const editMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/maintenance/reservations/${reservation.id}`, form),
    onSuccess: () => { setEditing(false); onRefresh(); toast({ title: "Réservation mise à jour" }); },
    onError: (e: any) => toast({ title: "Mise à jour impossible", description: e.message, variant: "destructive" }),
  });
  const freezeMutation = useMutation({
    mutationFn: (isFrozen: boolean) => apiRequest("PATCH", `/api/admin/maintenance/reservations/${reservation.id}/freeze`, { isFrozen }),
    onSuccess: () => { onRefresh(); toast({ title: reservation.isFrozen ? "Réservation dégelée" : "Réservation gelée" }); },
    onError: (e: any) => toast({ title: "Action impossible", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/maintenance/reservations/${reservation.id}`),
    onSuccess: () => { onRefresh(); onClose(); toast({ title: "Réservation supprimée" }); },
    onError: (e: any) => toast({ title: "Suppression impossible", description: e.message, variant: "destructive" }),
  });

  if (!reservation) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Réservation #{reservation.id}</DialogTitle></DialogHeader>
      {editing ? (
        <div className="space-y-2">
          <div><label className="text-xs text-muted-foreground">Service</label><Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-muted-foreground">Date</label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Heure</label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">Lieu</label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Besoin</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div>
            <label className="text-xs text-muted-foreground">Statut</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RESERVATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
            <Button disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>{editMutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2"><Badge variant="outline">{reservation.status}</Badge>{reservation.isFrozen && <Badge className="bg-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}</div>
          <Info icon={Wrench} label="Service / catégorie" value={`${reservation.service}${reservation.category ? ` · ${reservation.category}` : ""}`} />
          <Info icon={Zap} label="Urgence" value={reservation.urgency} />
          <Info icon={Calendar} label="Date / heure" value={`${reservation.date} ${reservation.time || ""}`} />
          <Info icon={MapPin} label="Lieu" value={reservation.location} />
          <Info icon={Phone} label="Contact" value={reservation.ownerPhone || reservation.contactPhone} />
          <Info icon={Briefcase} label="Maintenance" value={reservation.maintenanceName} />
          <Info icon={Users} label="Coffee Owner" value={reservation.cafeOwner} />
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground mb-1">Besoin</p><p className="whitespace-pre-wrap">{reservation.description || "—"}</p></div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-reservation"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
            <Button size="sm" variant="outline" disabled={freezeMutation.isPending} onClick={() => freezeMutation.mutate(!reservation.isFrozen)} data-testid="button-freeze-reservation">
              <Snowflake className={`h-3.5 w-3.5 mr-1.5 ${reservation.isFrozen ? "text-blue-600" : ""}`} />{reservation.isFrozen ? "Dégeler" : "Freeze"}
            </Button>
            {!confirmDelete ? (
              <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => setConfirmDelete(true)} data-testid="button-delete-reservation"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 p-2">
                <span className="text-xs text-destructive">Confirmer ?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-reservation">{deleteMutation.isPending ? "…" : "Confirmer"}</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>;
}

export default function MaintenanceAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  useRealtime();
  const [section, setSection] = useState("taxonomy");
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [profileType, setProfileType] = useState("all");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [rating, setRating] = useState("all");
  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/maintenance"] });
  useEffect(() => {
    if (!selectedAccount) return;
    const freshAccount = data?.accounts?.find((account) => account.userId === selectedAccount.userId);
    if (freshAccount && freshAccount !== selectedAccount) setSelectedAccount(freshAccount);
  }, [data?.accounts, selectedAccount?.userId]);
  useEffect(() => {
    if (!selectedReservation) return;
    const fresh = data?.reservations?.find((row: any) => row.id === selectedReservation.id);
    if (fresh && fresh !== selectedReservation) setSelectedReservation(fresh);
  }, [data?.reservations, selectedReservation?.id]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/maintenance"] });
    qc.invalidateQueries({ queryKey: ["/api/maintenance/categories"] });
    qc.invalidateQueries({ queryKey: ["/api/maintenance/taxonomy"] });
  };
  const stats = data?.stats;
  const filterOptions = useMemo(() => {
    const accounts = data?.accounts ?? [];
    return {
      types: Array.from(new Set(accounts.map((a) => a.profileType).filter(Boolean))).sort(),
      categories: Array.from(new Set(accounts.flatMap((a) => [...(a.categories ?? []), ...(a.skills ?? [])]))).sort(),
      locations: Array.from(new Set(accounts.flatMap((a) => (a.coverageArea || a.location || "").split(",").map((x: string) => x.trim()).filter(Boolean)))).sort(),
    };
  }, [data?.accounts]);
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => {
    const haystack = [a.name, a.jobTitle, a.location, a.coverageArea, ...(a.categories ?? []), ...(a.skills ?? [])].join(" ").toLowerCase();
    const zones = (a.coverageArea || a.location || "").split(",").map((x: string) => x.trim());
    const accountRating = (a.rating ?? 0) / 10;
    return (!search || haystack.includes(search.toLowerCase()))
      && (status === "all" || a.status === status)
      && (availability === "all" || (availability === "available" ? a.available : !a.available))
      && (visibility === "all" || (visibility === "visible" ? a.marketplaceVisible : !a.marketplaceVisible))
      && (profileType === "all" || a.profileType === profileType)
      && (category === "all" || [...(a.categories ?? []), ...(a.skills ?? [])].includes(category))
      && (location === "all" || zones.includes(location))
      && (rating === "all" || (rating === "rated" ? accountRating > 0 : accountRating >= Number(rating)));
  }), [data?.accounts, search, status, availability, visibility, profileType, category, location, rating]);
  const kpis = [
    ["Comptes Maintenance", stats?.totalAccounts ?? 0, Users], ["Actifs / approuvés", stats?.activeAccounts ?? 0, CheckCircle],
    ["Disponibles", stats?.availableAccounts ?? 0, Wrench], ["Réservations", stats?.totalReservations ?? 0, Calendar],
    ["En attente", stats?.pendingReservations ?? 0, Clock], ["Terminées", stats?.completedReservations ?? 0, CheckCircle],
    ["Annulées", stats?.cancelledReservations ?? 0, XCircle], ["Note moyenne", stats ? stats.averageRating.toFixed(1) : "0.0", Star],
  ] as const;
  return <div className="flex flex-col gap-6 p-6">
    <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Wrench className="w-6 h-6 text-orange-600" />Maintenance</h1><p className="text-muted-foreground text-sm mt-1">Suivi du marketplace Maintenance, des comptes, interventions et avis.</p></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{kpis.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4 flex items-center gap-3"><div className="rounded-xl bg-orange-500/10 p-2.5"><Icon className="w-4 h-4 text-orange-600" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div></CardContent></Card>)}</div>
    <Tabs value={section} onValueChange={setSection}>
      <TabsList className="flex-nowrap h-auto w-full justify-start overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        <TabsTrigger value="taxonomy" className="shrink-0">Compétences & zones</TabsTrigger>
        <TabsTrigger value="accounts" className="shrink-0">Comptes Maintenance</TabsTrigger>
        <TabsTrigger value="reservations" className="shrink-0">Réservations récentes</TabsTrigger>
      </TabsList>
      <TabsContent value="taxonomy" className="mt-4 grid lg:grid-cols-2 gap-6">
        <TaxonomyList title="Compétences demandées" kind="competencies" items={data?.taxonomy?.competencies ?? []} onRefresh={refresh} />
        <TaxonomyList title="Zone d'intervention" kind="zones" items={data?.taxonomy?.zones ?? []} onRefresh={refresh} />
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Demandes par compétence</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(data?.categories ?? []).map((row) => <Badge key={row.category} variant="secondary">{row.category} · {row.count}</Badge>)}</CardContent></Card>
      </TabsContent>
      <TabsContent value="accounts" className="mt-4 space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddAccountOpen(true)} data-testid="button-add-maintenance-account"><Plus className="h-4 w-4 mr-1.5" />Ajouter un compte Maintenance</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un compte, une zone, une compétence…" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent></Select>
          <Select value={visibility} onValueChange={setVisibility}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Visibilité" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes visibilités</SelectItem><SelectItem value="visible">Visible</SelectItem><SelectItem value="hidden">Masqué</SelectItem></SelectContent></Select>
          <Select value={availability} onValueChange={setAvailability}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes disponibilités</SelectItem><SelectItem value="available">Disponibles</SelectItem><SelectItem value="unavailable">Indisponibles</SelectItem></SelectContent></Select>
          <Select value={profileType} onValueChange={setProfileType}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les types</SelectItem>{filterOptions.types.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Compétence" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes compétences</SelectItem>{filterOptions.categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={location} onValueChange={setLocation}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Zone" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les zones</SelectItem>{filterOptions.locations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={rating} onValueChange={setRating}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Note" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les notes</SelectItem><SelectItem value="rated">Avec avis</SelectItem><SelectItem value="4">4+ étoiles</SelectItem><SelectItem value="3">3+ étoiles</SelectItem></SelectContent></Select>
        </div>
        {accounts.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun compte correspondant.</CardContent></Card> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{accounts.map((account) => <Card key={account.userId} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAccount(account)}><CardContent className="p-4 space-y-3"><div className="flex items-start gap-3"><Avatar><AvatarImage src={getAvatarUrl(account)} alt={account.name} /><AvatarFallback className="bg-orange-100 text-orange-700 font-bold">{account.initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{account.name}</h3><p className="text-xs text-muted-foreground truncate">{account.jobTitle}</p></div><span className={`h-2.5 w-2.5 rounded-full mt-1 ${account.available ? "bg-green-500" : "bg-gray-300"}`} /></div><div className="flex flex-wrap gap-1"><Badge variant="secondary" className="text-xs">{account.profileType}</Badge><Badge variant="outline" className="text-xs">{account.status}</Badge><span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{account.location || "—"}</span></div><div className="flex items-center justify-between text-xs"><Stars value={account.rating} /><span className="text-muted-foreground">{account.reviewCount} avis · {account.yearsExperience} ans exp.</span></div><div className="flex flex-wrap gap-1">{(account.skills ?? []).slice(0, 4).map((x: string) => <span key={x} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{x}</span>)}</div></CardContent></Card>)}</div>}
      </TabsContent>
      <TabsContent value="reservations" className="mt-4">
        {!data?.reservations?.length ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune réservation.</CardContent></Card> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(data?.reservations ?? []).slice(0, 50).map((row: any) => <ReservationCard key={row.id} row={row} onClick={() => setSelectedReservation(row)} />)}
          </div>
        )}
      </TabsContent>
    </Tabs>
    <AccountDetail account={selectedAccount} onClose={() => setSelectedAccount(null)} onRefresh={refresh} />
    <AddMaintenanceAccountModal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} onCreated={refresh} />
    <ReservationDetail reservation={selectedReservation} onClose={() => setSelectedReservation(null)} onRefresh={refresh} />
  </div>;
}