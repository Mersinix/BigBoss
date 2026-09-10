import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import type { MaintenanceReservationRow } from "@/pages/maintenance/planning";

type MaintenanceRevenueSummary = { history: { month: string; totalCents: number; reservations: number }[] };

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };
// Same background/border/radius as the Maintenance Dashboard reference
// (dashboard-overview.tsx's StatTile/"Prochaine intervention" cards).
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Mirrors barista-academy/analytics.tsx exactly — every metric computed
// client-side from the same real endpoints Planning/Profil/Avis already use
// (GET /api/maintenance/reservations, /api/maintenance/reviews/:userId,
// /api/maintenance/revenue), no duplicate analytics storage, no mock data.
export default function MaintenanceAnalyticsPage() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<MaintenanceReservationRow[]>({
    queryKey: ["/api/maintenance/reservations"],
    enabled: user?.role === "MAINTENANCE",
  });
  const { data: reviews = [] } = useQuery<any[]>({
    queryKey: ["/api/maintenance/reviews", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/reviews/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les avis");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const { data: revenue } = useQuery<MaintenanceRevenueSummary>({
    queryKey: ["/api/maintenance/revenue"],
    enabled: user?.role === "MAINTENANCE",
  });

  const reservationsByMonth = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; reservations: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = reservations.filter((r) => {
        const rd = new Date((r as any).createdAt ?? r.date);
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], reservations: count });
    }
    return buckets;
  }, [reservations]);

  const revenueByMonth = useMemo(() => (revenue?.history ?? []).map((h) => ({ month: h.month.slice(5), revenue: h.totalCents / 100 })), [revenue]);

  const topClients = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reservations) {
      if (r.status === "CANCELLED") continue;
      counts.set(r.cafeOwner, (counts.get(r.cafeOwner) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([cafeOwner, count]) => ({ cafeOwner, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [reservations]);

  const nonCancelled = reservations.filter((r) => r.status !== "CANCELLED");
  const completed = reservations.filter((r) => r.status === "COMPLETED");
  const completionRate = nonCancelled.length > 0 ? Math.round((completed.length / nonCancelled.length) * 100) : 0;
  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0;
  const categoriesUsed = new Set(reservations.map((r) => r.category).filter(Boolean)).size;

  if (reservationsLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analyses</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Vue d'ensemble de la performance de votre activité Maintenance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de complétion</p><p className="text-xl font-bold text-green-600">{completionRate}%</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{reviews.length > 0 ? avgRating.toFixed(1) : "—"}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Interventions totales</p><p className="text-xl font-bold">{reservations.length}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Catégories utilisées</p><p className="text-xl font-bold text-orange-600">{categoriesUsed}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Réservations par mois" icon={TrendingUp} className={CARD_CLASS}>
          {reservationsByMonth.every((h) => h.reservations === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={reservationsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} réservations`, "Réservations"]} />
                <Bar dataKey="reservations" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Revenu estimé par mois" icon={TrendingUp} className={CARD_CLASS}>
          {revenueByMonth.every((h) => h.revenue === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(Math.round((v as number) * 100)), "Revenus"]} />
                <Bar dataKey="revenue" fill="#fb923c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Meilleurs clients" icon={Users} className={CARD_CLASS}>
        {topClients.length === 0 ? <EmptyState message="Aucune réservation pour le moment." /> : (
          <div className="divide-y divide-border/40">
            {topClients.map((c, i) => <RankRow key={c.cafeOwner} rank={i + 1} title={c.cafeOwner} subtitle={`${c.count} réservation${c.count > 1 ? "s" : ""}`} value={String(c.count)} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
