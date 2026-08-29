import { useMemo, useState } from "react";
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
  Coffee, Users, CheckCircle, XCircle, Star, Plus, Pencil, Trash2, Snowflake, Search,
  MapPin, Phone, Mail, Calendar, TrendingUp, Wallet, Clock, ClipboardList, Briefcase, Award,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/use-auth";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { MessagesPanel } from "@/components/messages/messages-panel";

// Mirrors admin/print-page.tsx's architecture exactly: one aggregate overview
// endpoint (/api/admin/barista), client-side tabs/filters over it, no
// pagination, no separate per-tab fetch, no duplicate data — this page is a
// read/moderate layer over the exact same tables the public /barista
// marketplace, the Coffee Owner's "Marketplace Baristas" and the Barista
// Marketplace account itself already read from (baristaMarketplaceProfiles,
// -Requests, -Missions, baristaSkills, and supplierProductReviews scoped to
// reviewType='BARISTA_MARKETPLACE'). This is Marketplace Baristas ONLY —
// Barista Academy (/academy) is a separate, static-content service and is
// deliberately not represented here (see the Barista/Academy split rationale
// on shared/schema.ts's serviceKeyEnum).

type SkillItem = { id: number; name: string; isActive: boolean; isFrozen: boolean };
type AdminBarista = {
  userId: number; name: string; email: string; phone: string | null; profileImageUrl: string | null;
  status: string; level: string; city: string; location: string; bio: string; skills: string[];
  availableDays: string[]; isAvailable: boolean; isOnVacation: boolean; marketplaceVisible: boolean;
  available: boolean; dailyRateInCents: number; rating: number; reviewCount: number;
  requestCount: number; missionCount: number; completedMissionCount: number; revenueCents: number;
  createdAt: string | null; initials: string;
};
type AdminRequest = {
  id: number; cafeOwnerId: number; baristaUserId: number; missionType: string; message: string;
  proposedRateInCents: number | null; startDate: string; endDate: string | null; status: string;
  cancelReason: string | null; createdAt: string | null; respondedAt: string | null;
  cafeOwnerName: string; baristaName: string;
};
type AdminMission = {
  id: number; requestId: number; cafeOwnerId: number; baristaUserId: number; missionType: string;
  rateInCents: number; startDate: string; endDate: string | null; status: string;
  createdAt: string | null; completedAt: string | null; cancelledAt: string | null;
  cafeOwnerName: string; baristaName: string;
};
type AdminReview = {
  id: number; rating: number; comment: string | null; cafeName: string; cafeOwnerName: string | null;
  createdAt: string | null; baristaMissionId: number | null; baristaName: string;
};
type Overview = {
  stats: {
    totalBaristas: number; activeBaristas: number; availableBaristas: number;
    totalRequests: number; pendingRequests: number;
    totalMissions: number; completedMissions: number; cancelledMissions: number;
    completedMissionValueCents: number; pendingMissionValueCents: number;
    reviewCount: number; averageRating: number;
  };
  skills: SkillItem[];
  baristas: AdminBarista[];
  requests: AdminRequest[];
  missions: AdminMission[];
  reviews: AdminReview[];
};

const LEVEL_LABELS: Record<string, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };
const LEVEL_COLORS: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700", ADVANCED: "bg-blue-100 text-blue-700", EXPERT: "bg-purple-100 text-purple-700",
};
// Same labels/colors as barista-marketplace/requests.tsx and missions.tsx — Admin must
// read the exact same business states, never invent its own.
const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente", DISCUSSION: "En discussion", ACCEPTED: "Acceptée",
  REJECTED: "Refusée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700", DISCUSSION: "bg-blue-100 text-blue-700", ACCEPTED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-gray-100 text-gray-600", COMPLETED: "bg-purple-100 text-purple-700",
};
const MISSION_STATUS_LABELS: Record<string, string> = { UPCOMING: "À venir", ACTIVE: "En cours", COMPLETED: "Terminée", CANCELLED: "Annulée" };
const MISSION_STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-blue-100 text-blue-700", ACTIVE: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700", CANCELLED: "bg-gray-100 text-gray-600",
};

function RequestStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={REQUEST_STATUS_COLORS[status] ?? ""}>{REQUEST_STATUS_LABELS[status] ?? status}</Badge>;
}
function MissionStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={MISSION_STATUS_COLORS[status] ?? ""}>{MISSION_STATUS_LABELS[status] ?? status}</Badge>;
}

// ── Skills taxonomy (mirrors Print's CategoryTaxonomy — flat list, same admin-managed
// pattern already backing GET /api/barista/skills, just without an Admin UI until now) ──

function SkillsTaxonomy({ items, onRefresh }: { items: SkillItem[]; onRefresh: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/barista/skills", { name: draft.trim() }),
    onSuccess: () => { setDraft(""); onRefresh(); toast({ title: "Compétence ajoutée" }); },
    onError: (e: any) => toast({ title: "Impossible d'ajouter", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/admin/barista/skills/${id}`, data),
    onSuccess: () => { setEditing(null); onRefresh(); },
    onError: () => toast({ title: "Mise à jour impossible", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/barista/skills/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "Suppression impossible", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Compétences Barista</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ajouter une compétence" onKeyDown={(e) => e.key === "Enter" && draft.trim() && create.mutate()} data-testid="input-new-barista-skill" />
          <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={() => create.mutate()} data-testid="button-add-barista-skill"><Plus className="h-4 w-4 mr-1" />Ajouter</Button>
        </div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune compétence.</p> : items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2" data-testid={`row-barista-skill-${item.id}`}>
            {editing === item.id ? (
              <Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && editValue.trim()) update.mutate({ id: item.id, data: { name: editValue.trim() } });
                if (e.key === "Escape") setEditing(null);
              }} />
            ) : <span className="flex-1 text-sm font-medium">{item.name}</span>}
            {item.isFrozen && <Badge variant="outline" className="text-xs text-blue-600"><Snowflake className="h-3 w-3 mr-1" />Gelé</Badge>}
            {!item.isActive && <Badge variant="secondary" className="text-xs">Inactif</Badge>}
            {editing === item.id
              ? <Button size="sm" onClick={() => editValue.trim() && update.mutate({ id: item.id, data: { name: editValue.trim() } })}>OK</Button>
              : <Button variant="ghost" size="icon" onClick={() => { setEditing(item.id); setEditValue(item.name); }}><Pencil className="h-3.5 w-3.5" /></Button>}
            <Button variant="ghost" size="icon" title={item.isFrozen ? "Dégeler" : "Geler"} onClick={() => update.mutate({ id: item.id, data: { isFrozen: !item.isFrozen } })}><Snowflake className={`h-3.5 w-3.5 ${item.isFrozen ? "text-blue-600" : ""}`} /></Button>
            <Button variant="ghost" size="icon" title={item.isActive ? "Désactiver" : "Activer"} onClick={() => update.mutate({ id: item.id, data: { isActive: !item.isActive } })}><CheckCircle className={`h-3.5 w-3.5 ${item.isActive ? "text-green-600" : "text-muted-foreground"}`} /></Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(item.id)} data-testid={`button-delete-barista-skill-${item.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Barista detail dialog ──────────────────────────────────────────────────────

function BaristaDetail({ barista, onClose }: { barista: AdminBarista | null; onClose: () => void }) {
  const fmt = useFormatCurrency();
  if (!barista) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar><AvatarImage src={getAvatarUrl(barista)} alt={barista.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{barista.initials}</AvatarFallback></Avatar>
            <span>{barista.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Badge variant="outline">{barista.status}</Badge>
            <Badge className={LEVEL_COLORS[barista.level] ?? ""} variant="outline">{LEVEL_LABELS[barista.level] ?? barista.level}</Badge>
            <Badge variant={barista.available ? "default" : "secondary"}>{barista.available ? "Disponible" : "Indisponible"}</Badge>
            {!barista.marketplaceVisible && <Badge variant="secondary">Masqué du marketplace</Badge>}
          </div>
          <div className="flex gap-2"><Mail className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Email</p><p>{barista.email}</p></div></div>
          <div className="flex gap-2"><Phone className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Téléphone</p><p>{barista.phone || "—"}</p></div></div>
          <div className="flex gap-2"><MapPin className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Localisation</p><p>{barista.location || "—"}</p></div></div>
          <div className="flex gap-2"><Calendar className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Inscription</p><p>{barista.createdAt ? new Date(barista.createdAt).toLocaleDateString("fr-FR") : "—"}</p></div></div>
          <div className="flex gap-2"><Wallet className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Tarif journalier</p><p>{fmt(barista.dailyRateInCents)}</p></div></div>
          <div className="flex gap-2"><Briefcase className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Missions</p><p>{barista.completedMissionCount} terminée(s) / {barista.missionCount} au total</p></div></div>
          <div className="flex gap-2"><ClipboardList className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Demandes reçues</p><p>{barista.requestCount}</p></div></div>
          <div className="flex gap-2"><Wallet className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Revenu (missions terminées)</p><p>{fmt(barista.revenueCents)}</p></div></div>
          <div className="flex gap-2"><Star className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" /><div><p className="text-xs text-muted-foreground">Évaluation</p><p>{barista.reviewCount > 0 ? `${(barista.rating / 10).toFixed(1)} (${barista.reviewCount} avis)` : "Aucun avis"}</p></div></div>
          {barista.bio && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Bio</p><p className="whitespace-pre-wrap">{barista.bio}</p></div>}
          {barista.skills.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Compétences</p>
              <div className="flex flex-wrap gap-1">{barista.skills.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}</div>
            </div>
          )}
          {barista.availableDays.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Disponibilité hebdomadaire</p>
              <div className="flex flex-wrap gap-1">{barista.availableDays.map((d) => <Badge key={d} variant="outline" className="text-xs">{d}</Badge>)}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

export default function AdminBaristaPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  useRealtime();

  const [section, setSection] = useState("overview");
  const [selectedBarista, setSelectedBarista] = useState<AdminBarista | null>(null);

  const [baristaSearch, setBaristaSearch] = useState("");
  const [baristaStatus, setBaristaStatus] = useState("all");
  const [baristaLevel, setBaristaLevel] = useState("all");

  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatus, setRequestStatus] = useState("all");

  const [missionSearch, setMissionSearch] = useState("");
  const [missionStatus, setMissionStatus] = useState("all");

  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/barista"] });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/barista"] });
    qc.invalidateQueries({ queryKey: ["/api/barista/skills"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/users/${id}/status`, { status }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "Statut mis à jour" }); },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const stats = data?.stats;
  const kpis = [
    ["Baristas", stats?.totalBaristas ?? 0, Users],
    ["Actifs / approuvés", stats?.activeBaristas ?? 0, CheckCircle],
    ["Disponibles", stats?.availableBaristas ?? 0, Coffee],
    ["Demandes", stats?.totalRequests ?? 0, ClipboardList],
    ["Missions", stats?.totalMissions ?? 0, Briefcase],
    ["En attente", stats?.pendingRequests ?? 0, Clock],
    ["Terminées", stats?.completedMissions ?? 0, CheckCircle],
    ["Annulées", stats?.cancelledMissions ?? 0, XCircle],
  ] as const;

  // ── Baristas tab ──
  const baristas = useMemo(() => (data?.baristas ?? []).filter((b) => {
    const haystack = [b.name, b.email, b.location, b.skills.join(" ")].join(" ").toLowerCase();
    return (!baristaSearch || haystack.includes(baristaSearch.toLowerCase()))
      && (baristaStatus === "all" || b.status === baristaStatus)
      && (baristaLevel === "all" || b.level === baristaLevel);
  }), [data?.baristas, baristaSearch, baristaStatus, baristaLevel]);

  // ── Requests tab ──
  const requests = useMemo(() => (data?.requests ?? []).filter((r) => {
    const haystack = [r.missionType, r.cafeOwnerName, r.baristaName, r.message].join(" ").toLowerCase();
    return (!requestSearch || haystack.includes(requestSearch.toLowerCase()))
      && (requestStatus === "all" || r.status === requestStatus);
  }), [data?.requests, requestSearch, requestStatus]);

  // ── Missions tab ──
  const missions = useMemo(() => (data?.missions ?? []).filter((m) => {
    const haystack = [m.missionType, m.cafeOwnerName, m.baristaName].join(" ").toLowerCase();
    return (!missionSearch || haystack.includes(missionSearch.toLowerCase()))
      && (missionStatus === "all" || m.status === missionStatus);
  }), [data?.missions, missionSearch, missionStatus]);

  // ── Analytics tab — bucketed client-side from the full missions list, same
  // approach admin/print-page.tsx already uses for every other analytics chart. ──
  const revenueByMonth = useMemo(() => {
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = (key: string) => {
      const [y, m] = key.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
    };
    const now = new Date();
    const byMonth = new Map<string, number>();
    for (const m of data?.missions ?? []) {
      if (m.status !== "COMPLETED" || !(m.completedAt ?? m.createdAt)) continue;
      const key = monthKey(new Date(m.completedAt ?? m.createdAt!));
      byMonth.set(key, (byMonth.get(key) ?? 0) + m.rateInCents);
    }
    const history: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      history.push({ month: monthLabel(key), revenue: (byMonth.get(key) ?? 0) / 100 });
    }
    return history;
  }, [data?.missions]);

  const topBaristas = useMemo(
    () => (data?.baristas ?? []).slice().sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5),
    [data?.baristas],
  );
  const completionRate = stats && stats.totalMissions > 0 ? Math.round((stats.completedMissions / stats.totalMissions) * 100) : 0;
  const cancellationRate = stats && stats.totalMissions > 0 ? Math.round((stats.cancelledMissions / stats.totalMissions) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Coffee className="w-6 h-6 text-indigo-600" />BARISTA</h1>
        <p className="text-muted-foreground text-sm mt-1">Contrôle centralisé du Marketplace Baristas : profils, demandes, missions et revenus.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/10 p-2.5"><Icon className="w-4 h-4 text-indigo-600" /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="baristas">Baristas</TabsTrigger>
          <TabsTrigger value="requests">Demandes</TabsTrigger>
          <TabsTrigger value="missions">Missions</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="reviews">Avis</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="skills">Compétences</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Demandes récentes</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.requests ?? []).length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Aucune demande pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Barista</th><th className="p-3">Coffee Owner</th><th className="p-3">Mission</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {(data?.requests ?? []).slice(0, 10).map((r) => (
                      <tr key={r.id} className="border-b last:border-0" data-testid={`row-recent-request-${r.id}`}>
                        <td className="p-3 font-medium">#{r.id}</td>
                        <td className="p-3">{r.baristaName}</td>
                        <td className="p-3">{r.cafeOwnerName}</td>
                        <td className="p-3">{r.missionType || "—"}</td>
                        <td className="p-3"><RequestStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Missions récentes</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.missions ?? []).length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Aucune mission pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Barista</th><th className="p-3">Coffee Owner</th><th className="p-3">Montant</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {(data?.missions ?? []).slice(0, 10).map((m) => (
                      <tr key={m.id} className="border-b last:border-0" data-testid={`row-recent-mission-${m.id}`}>
                        <td className="p-3 font-medium">#{m.id}</td>
                        <td className="p-3">{m.baristaName}</td>
                        <td className="p-3">{m.cafeOwnerName}</td>
                        <td className="p-3">{fmt(m.rateInCents)}</td>
                        <td className="p-3"><MissionStatusBadge status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Baristas ── */}
        <TabsContent value="baristas" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={baristaSearch} onChange={(e) => setBaristaSearch(e.target.value)} placeholder="Rechercher un barista…" data-testid="input-search-baristas" /></div>
            <Select value={baristaStatus} onValueChange={setBaristaStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="approved">Approuvé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="rejected">Rejeté</SelectItem></SelectContent>
            </Select>
            <Select value={baristaLevel} onValueChange={setBaristaLevel}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Niveau" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous niveaux</SelectItem><SelectItem value="BEGINNER">Débutant</SelectItem><SelectItem value="ADVANCED">Avancé</SelectItem><SelectItem value="EXPERT">Expert</SelectItem></SelectContent>
            </Select>
          </div>
          {baristas.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground">Aucun barista correspondant.</CardContent></Card> : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {baristas.map((barista) => (
                <Card key={barista.userId} className="hover:shadow-md transition-shadow" data-testid={`card-barista-${barista.userId}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3 cursor-pointer" onClick={() => setSelectedBarista(barista)}>
                      <Avatar><AvatarImage src={getAvatarUrl(barista)} alt={barista.name} /><AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{barista.initials}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{barista.name}</h3><p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" />{barista.location || "—"}</p></div>
                      <span className={`h-2.5 w-2.5 rounded-full mt-1 ${barista.available ? "bg-green-500" : "bg-gray-300"}`} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{barista.status}</Badge>
                      <Badge className={`text-xs ${LEVEL_COLORS[barista.level] ?? ""}`} variant="outline">{LEVEL_LABELS[barista.level] ?? barista.level}</Badge>
                      {!barista.marketplaceVisible && <Badge variant="secondary" className="text-xs">Masqué</Badge>}
                      <Badge variant="secondary" className="text-xs">{barista.missionCount} mission(s)</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{fmt(barista.dailyRateInCents)}/jour</span><span>{barista.reviewCount > 0 ? `★ ${(barista.rating / 10).toFixed(1)}` : "Aucun avis"}</span></div>
                    {barista.status !== "approved" && (
                      <Button size="sm" className="w-full h-7 text-xs" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: barista.userId, status: "approved" })} data-testid={`button-approve-barista-${barista.userId}`}>Approuver</Button>
                    )}
                    {barista.status === "approved" && (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: barista.userId, status: "rejected" })} data-testid={`button-suspend-barista-${barista.userId}`}>Suspendre</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Requests (Demandes) ── */}
        <TabsContent value="requests" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} placeholder="Rechercher une demande, un barista, un client…" data-testid="input-search-requests" /></div>
            <Select value={requestStatus} onValueChange={setRequestStatus}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {requests.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune demande correspondante.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Coffee Owner</th><th className="p-3">Barista</th><th className="p-3">Mission</th><th className="p-3">Tarif proposé</th><th className="p-3">Dates</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {requests.slice(0, 100).map((r) => (
                      <tr key={r.id} className="border-b last:border-0" data-testid={`row-request-${r.id}`}>
                        <td className="p-3 font-medium">#{r.id}</td>
                        <td className="p-3">{r.cafeOwnerName}</td>
                        <td className="p-3">{r.baristaName}</td>
                        <td className="p-3">{r.missionType || "—"}</td>
                        <td className="p-3">{r.proposedRateInCents != null ? fmt(r.proposedRateInCents) : "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.startDate}{r.endDate ? ` → ${r.endDate}` : ""}</td>
                        <td className="p-3"><RequestStatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Missions ── */}
        <TabsContent value="missions" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={missionSearch} onChange={(e) => setMissionSearch(e.target.value)} placeholder="Rechercher une mission, un barista, un client…" data-testid="input-search-missions" /></div>
            <Select value={missionStatus} onValueChange={setMissionStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(MISSION_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {missions.length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucune mission correspondante.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">ID</th><th className="p-3">Coffee Owner</th><th className="p-3">Barista</th><th className="p-3">Mission</th><th className="p-3">Montant</th><th className="p-3">Dates</th><th className="p-3">Statut</th></tr></thead>
                  <tbody>
                    {missions.slice(0, 100).map((m) => (
                      <tr key={m.id} className="border-b last:border-0" data-testid={`row-mission-${m.id}`}>
                        <td className="p-3 font-medium">#{m.id}</td>
                        <td className="p-3">{m.cafeOwnerName}</td>
                        <td className="p-3">{m.baristaName}</td>
                        <td className="p-3">{m.missionType || "—"}</td>
                        <td className="p-3">{fmt(m.rateInCents)}</td>
                        <td className="p-3 text-muted-foreground">{m.startDate}{m.endDate ? ` → ${m.endDate}` : ""}</td>
                        <td className="p-3"><MissionStatusBadge status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Messages — reuses the exact same MessagesPanel + central Messages System
        that Admin → Messages already uses, scoped to service="BARISTA". No second
        messaging system: this is the same conversations Coffee Owner ↔ Barista already
        see, governed by the same visibility/export/broadcast controls. ── */}
        <TabsContent value="messages" className="mt-4">
          <Card className="overflow-hidden">
            {user && <MessagesPanel currentUserId={user.id} showRoleIndicator service="BARISTA" />}
          </Card>
          <p className="text-xs text-muted-foreground mt-2">Pour la modération avancée (masquer/supprimer des conversations, export, broadcast), utilisez Admin → Messages → BARISTA.</p>
        </TabsContent>

        {/* ── Reviews (Avis) ── */}
        <TabsContent value="reviews" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {(data?.reviews ?? []).length === 0 ? <p className="p-12 text-center text-muted-foreground">Aucun avis Barista pour le moment.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Barista</th><th className="p-3">Client</th><th className="p-3">Note</th><th className="p-3">Commentaire</th><th className="p-3">Date</th></tr></thead>
                  <tbody>
                    {(data?.reviews ?? []).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3">{r.baristaName}</td>
                        <td className="p-3">{r.cafeOwnerName || r.cafeName}</td>
                        <td className="p-3 flex items-center gap-1 text-amber-500"><Star className="h-3.5 w-3.5 fill-current" />{r.rating}</td>
                        <td className="p-3 max-w-[280px] truncate">{r.comment || "—"}</td>
                        <td className="p-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Finance — derived entirely from mission.rateInCents, exactly like the
        Barista's own Revenus page (getBaristaRevenueSummary): no platform commission
        field exists anywhere in the data model, so none is fabricated here. ── */}
        <TabsContent value="finance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valeur totale (missions terminées + en cours)</p><p className="text-xl font-bold">{fmt((stats?.completedMissionValueCents ?? 0) + (stats?.pendingMissionValueCents ?? 0))}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Missions terminées</p><p className="text-xl font-bold text-green-600">{fmt(stats?.completedMissionValueCents ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">À venir / en cours</p><p className="text-xl font-bold text-amber-600">{fmt(stats?.pendingMissionValueCents ?? 0)}</p></CardContent></Card>
          </div>
          <p className="text-xs text-muted-foreground">Le Marketplace Baristas est une mise en relation directe Coffee Owner ↔ Barista, sans commission plateforme — les montants ci-dessus correspondent donc au tarif convenu de chaque mission, comme sur la page Revenus du Barista.</p>
          <Card>
            <CardHeader><CardTitle className="text-base">Meilleurs baristas par revenu</CardTitle></CardHeader>
            <CardContent>
              {topBaristas.length === 0 ? <EmptyState message="Aucune donnée pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topBaristas.map((b, i) => <RankRow key={b.userId} rank={i + 1} title={b.name} subtitle={`${b.completedMissionCount} mission(s) terminée(s)`} value={fmt(b.revenueCents)} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics ── */}
        <TabsContent value="analytics" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de complétion</p><p className="text-xl font-bold text-green-600">{completionRate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'annulation</p><p className="text-xl font-bold text-red-600">{cancellationRate}%</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Demandes en attente</p><p className="text-xl font-bold">{stats?.pendingRequests ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{stats && stats.reviewCount > 0 ? stats.averageRating.toFixed(1) : "—"}</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Valeur des missions terminées par mois" icon={TrendingUp}>
              {revenueByMonth.every((h) => h.revenue === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(Math.round((v as number) * 100)), "Valeur"]} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
            <SectionCard title="Meilleurs baristas" icon={Award}>
              {topBaristas.length === 0 ? <EmptyState message="Aucun barista pour le moment." /> : (
                <div className="divide-y divide-border/40">
                  {topBaristas.map((b, i) => <RankRow key={b.userId} rank={i + 1} title={b.name} subtitle={`${b.missionCount} mission(s)`} value={fmt(b.revenueCents)} />)}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── Skills taxonomy ── */}
        <TabsContent value="skills" className="mt-4">
          <SkillsTaxonomy items={data?.skills ?? []} onRefresh={refresh} />
        </TabsContent>
      </Tabs>

      <BaristaDetail barista={selectedBarista} onClose={() => setSelectedBarista(null)} />
    </div>
  );
}
