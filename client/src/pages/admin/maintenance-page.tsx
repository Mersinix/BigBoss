import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wrench, Users, Calendar, Clock, CheckCircle, XCircle, Star } from "lucide-react";

type Overview = {
  stats: {
    totalAccounts: number; activeAccounts: number; availableAccounts: number;
    totalReservations: number; pendingReservations: number; completedReservations: number;
    cancelledReservations: number; reviewCount: number; averageRating: number;
  };
  categories: { category: string; count: number }[];
  accounts: any[];
  reservations: any[];
  reviews: any[];
};

export default function MaintenanceAdminPage() {
  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/admin/maintenance"] });
  const stats = data?.stats;
  const kpis = [
    ["Comptes Maintenance", stats?.totalAccounts ?? 0, Users],
    ["Actifs / approuvés", stats?.activeAccounts ?? 0, CheckCircle],
    ["Disponibles", stats?.availableAccounts ?? 0, Wrench],
    ["Réservations", stats?.totalReservations ?? 0, Calendar],
    ["En attente", stats?.pendingReservations ?? 0, Clock],
    ["Terminées", stats?.completedReservations ?? 0, CheckCircle],
    ["Annulées", stats?.cancelledReservations ?? 0, XCircle],
    ["Note moyenne", stats ? stats.averageRating.toFixed(1) : "0.0", Star],
  ] as const;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Wrench className="w-6 h-6 text-orange-600" />Maintenance</h1>
        <p className="text-muted-foreground text-sm mt-1">Suivi du marketplace Maintenance, des comptes, interventions et avis.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4 flex items-center gap-3"><div className="rounded-xl bg-orange-500/10 p-2.5"><Icon className="w-4 h-4 text-orange-600" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{isLoading ? "…" : value}</p></div></CardContent></Card>)}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1"><CardHeader><CardTitle className="text-base">Compétences demandées</CardTitle></CardHeader><CardContent className="space-y-3">{(data?.categories ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : data!.categories.slice(0, 10).map((row) => <div key={row.category} className="flex justify-between text-sm"><span>{row.category}</span><Badge variant="secondary">{row.count}</Badge></div>)}</CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Comptes Maintenance</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Statut</TableHead><TableHead>Type</TableHead><TableHead>Zone</TableHead><TableHead>Visibilité</TableHead><TableHead>Note</TableHead></TableRow></TableHeader><TableBody>{(data?.accounts ?? []).map((account) => <TableRow key={account.userId}><TableCell className="font-medium">{account.name}</TableCell><TableCell><Badge variant="outline">{account.status}</Badge></TableCell><TableCell>{account.profileType}</TableCell><TableCell>{account.location || "—"}</TableCell><TableCell>{account.marketplaceVisible && account.isAvailable && !account.isOnVacation ? "Visible" : "Masqué"}</TableCell><TableCell>{account.rating ? (account.rating / 10).toFixed(1) : "—"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Réservations récentes</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Service</TableHead><TableHead>Catégorie</TableHead><TableHead>Urgence</TableHead><TableHead>Date</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>{(data?.reservations ?? []).slice(0, 30).map((row) => <TableRow key={row.id}><TableCell>#{row.id}</TableCell><TableCell>{row.service}</TableCell><TableCell>{row.category || "—"}</TableCell><TableCell>{row.urgency}</TableCell><TableCell>{row.date} {row.time || ""}</TableCell><TableCell><Badge variant="outline">{row.status}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}