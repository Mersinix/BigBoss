import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Wrench, Users, Calendar, Clock, CheckCircle, XCircle, Star, Plus, Pencil,
  Trash2, Snowflake, Search, MapPin, Phone, Award, Briefcase, Timer,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type TaxonomyItem = { id: number; name: string; isActive: boolean; isFrozen: boolean };
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
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const path = kind === "competencies" ? "competencies" : "zones";
  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/maintenance/${path}`, { name: draft.trim() }),
    onSuccess: () => { setDraft(""); onRefresh(); toast({ title: "Ajouté" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/maintenance/${path}/${id}`, data),
    onSuccess: () => { setEditing(null); onRefresh(); },
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
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ajouter ${kind === "zones" ? "une zone" : "une compétence"}`} onKeyDown={(e) => e.key === "Enter" && draft.trim() && create.mutate()} />
        <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
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

function AccountDetail({ account, onClose }: { account: any | null; onClose: () => void }) {
  if (!account) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-3">
        <Avatar><AvatarFallback className="bg-orange-100 text-orange-700 font-bold">{account.initials}</AvatarFallback></Avatar>
        <span>{account.name}</span>
      </DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Badge variant="outline">{account.status}</Badge><Badge variant="secondary">{account.profileType}</Badge>
          <Badge className={account.marketplaceVisible ? "bg-green-600" : ""}>{account.marketplaceVisible ? "Visible marketplace" : "Masqué"}</Badge>
          <Badge variant="outline">{account.available ? "Disponible" : "Indisponible"}</Badge>
        </div>
        <Info icon={Briefcase} label="Poste" value={account.jobTitle} />
        <Info icon={MapPin} label="Zone / localisation" value={account.location || account.coverageArea} />
        <Info icon={Phone} label="Téléphone" value={account.phone} />
        <Info icon={Timer} label="Temps de réponse" value={account.responseTime} />
        <Info icon={Award} label="Expérience" value={`${account.yearsExperience} ans`} />
        <Info icon={Star} label="Évaluation" value={<><Stars value={account.rating} /> ({account.reviewCount} avis)</>} />
        <div><p className="text-xs text-muted-foreground mb-1">Compétences / catégories</p><div className="flex flex-wrap gap-1">{[...(account.categories ?? []), ...(account.skills ?? [])].map((x: string) => <Badge key={x} variant="secondary" className="text-xs">{x}</Badge>)}</div></div>
        <div><p className="text-xs text-muted-foreground mb-1">Certifications</p><p>{(account.certifications ?? []).join(", ") || "—"}</p></div>
        <div className="sm:col-span-2"><p className="text-xs text-muted-foreground mb-1">Description</p><p className="whitespace-pre-wrap">{account.description || "—"}</p></div>
        <Info icon={Calendar} label="Jours et horaires" value={`${(account.workingDays ?? []).join(", ") || "—"} · ${account.startTime}–${account.endTime}`} />
        <Info icon={Wrench} label="Tarif journalier" value={`${((account.dailyRateInCents ?? 0) / 100).toFixed(2)} DT`} />
      </div>
    </DialogContent>
  </Dialog>;
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return <div className="flex gap-2"><Icon className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">{label}</p><p>{value || "—"}</p></div></div>;
}

export default function MaintenanceAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [section, setSection] = useState("taxonomy");
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/maintenance"] });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["/api/admin/maintenance"] }); qc.invalidateQueries({ queryKey: ["/api/maintenance/categories"] }); };
  const stats = data?.stats;
  const accounts = useMemo(() => (data?.accounts ?? []).filter((a) => {
    const haystack = [a.name, a.jobTitle, a.location, a.coverageArea, ...(a.categories ?? []), ...(a.skills ?? [])].join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && (status === "all" || a.status === status) && (availability === "all" || (availability === "available" ? a.available : !a.available));
  }), [data?.accounts, search, status, availability]);
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
      <TabsList><TabsTrigger value="taxonomy">Compétences & zones</TabsTrigger><TabsTrigger value="accounts">Comptes Maintenance</TabsTrigger><TabsTrigger value="reservations">Réservations récentes</TabsTrigger></TabsList>
      <TabsContent value="taxonomy" className="mt-4 grid lg:grid-cols-2 gap-6">
        <TaxonomyList title="Compétences demandées" kind="competencies" items={data?.taxonomy?.competencies ?? []} onRefresh={refresh} />
        <TaxonomyList title="Zone d'intervention" kind="zones" items={data?.taxonomy?.zones ?? []} onRefresh={refresh} />
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Demandes par compétence</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(data?.categories ?? []).map((row) => <Badge key={row.category} variant="secondary">{row.category} · {row.count}</Badge>)}</CardContent></Card>
      </TabsContent>
      <TabsContent value="accounts" className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2"><div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un compte, une zone, une compétence…" /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent></Select><Select value={availability} onValueChange={setAvailability}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Disponibilité" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem><SelectItem value="available">Disponibles</SelectItem><SelectItem value="unavailable">Indisponibles</SelectItem></SelectContent></Select></div>
        {accounts.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun compte correspondant.</CardContent></Card> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{accounts.map((account) => <Card key={account.userId} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedAccount(account)}><CardContent className="p-4 space-y-3"><div className="flex items-start gap-3"><Avatar><AvatarFallback className="bg-orange-100 text-orange-700 font-bold">{account.initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{account.name}</h3><p className="text-xs text-muted-foreground truncate">{account.jobTitle}</p></div><span className={`h-2.5 w-2.5 rounded-full mt-1 ${account.available ? "bg-green-500" : "bg-gray-300"}`} /></div><div className="flex flex-wrap gap-1"><Badge variant="secondary" className="text-xs">{account.profileType}</Badge><Badge variant="outline" className="text-xs">{account.status}</Badge><span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{account.location || "—"}</span></div><div className="flex items-center justify-between text-xs"><Stars value={account.rating} /><span className="text-muted-foreground">{account.reviewCount} avis · {account.yearsExperience} ans exp.</span></div><div className="flex flex-wrap gap-1">{(account.skills ?? []).slice(0, 4).map((x: string) => <span key={x} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{x}</span>)}</div></CardContent></Card>)}</div>}
      </TabsContent>
      <TabsContent value="reservations" className="mt-4"><Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Service / catégorie</th><th className="p-3">Date</th><th className="p-3">Statut</th><th className="p-3">Maintenance</th><th className="p-3">Coffee Owner</th><th className="p-3">Contact / lieu</th><th className="p-3">Besoin</th></tr></thead><tbody>{(data?.reservations ?? []).slice(0, 50).map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-3 font-medium">#{row.id}</td><td className="p-3">{row.service}<br /><span className="text-xs text-muted-foreground">{row.category || "—"} · {row.urgency}</span></td><td className="p-3">{row.date}<br />{row.time || "—"}</td><td className="p-3"><Badge variant="outline">{row.status}</Badge></td><td className="p-3">{row.maintenanceName}</td><td className="p-3">{row.cafeOwner}</td><td className="p-3">{row.ownerPhone || row.contactPhone || "—"}<br /><span className="text-xs text-muted-foreground">{row.location || "—"}</span></td><td className="p-3 max-w-[240px]">{row.description || "—"}</td></tr>)}</tbody></table>{!data?.reservations?.length && <p className="p-12 text-center text-muted-foreground">Aucune réservation.</p>}</CardContent></Card></TabsContent>
    </Tabs>
    <AccountDetail account={selectedAccount} onClose={() => setSelectedAccount(null)} />
  </div>;
}